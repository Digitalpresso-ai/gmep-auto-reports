import "server-only";
import { parseDocument } from "htmlparser2";
import { callModel, ModelStreamError, type ModelRequest } from "./ai";
import { db } from "./db";
import { buildAgentPrompt, buildAgentRevision } from "./domain/agent";
import { numberedForModel, parseBlocks, type BlockDoc } from "./domain/blocks";
import { buildPrompt, type Material, type PromptInput } from "./domain/prompt";
import { REPORT_JSON_SCHEMA, normalizeReport, parseModelJson, renderReportHtml, type Report } from "./domain/report";
import { photoKey } from "@/lib/photo-layout";
import { canGenerate, canRevise, usageView, type UsageView } from "./domain/usage";
import { GMEP_DAILY } from "./domain/template";
import { DEADLINE_MS, runReportAgent, type AgentResult, type TurnUsage } from "./report-agent";
import { cleanReportHtml, titleOf } from "./sanitize";
import { aiModel } from "./settings";
import { getObject } from "./storage";
import { usageCounts, recordUsage, type UsageEntry } from "./usage";
import { getDraft } from "./workspace";

const MAX_SCHEDULE_IMAGES = 8;
// 함수가 비정상 종료해 남은 진행 기록은 이 시간이 지나면 무시한다
const STALE_INFLIGHT = "5 minutes";

// 남은 시간이 이보다 적으면 모델 한 턴도 끝내기 어려우므로 부르지 않는다
const MIN_AGENT_MS = 30_000;

type ReportView = { title: string; bodyHtml: string; updatedAt: string };
type AiFailure = { kind: "limit_reached" | "in_progress" | "ai_failed" | "ai_parse_failed" };

export type GenerateOutcome = { kind: "ok"; report: ReportView; usage: UsageView } | { kind: "report_exists" } | AiFailure;

export type Revision = { request: string; createdAt: string };
export type ReviseOutcome = { kind: "ok"; report: ReportView; usage: UsageView; revisions: Revision[] } | { kind: "no_report" } | AiFailure;

/**
 * 회사가 미리보기에서 고친 HTML을 저장한다(FUNC-9). AI가 생성·수정 중이면 거부한다.
 * 그 결과가 저장되면 이 편집이 지워지고, 수정은 편집 전 본문을 보고 만든 것이기 때문이다.
 */
export async function saveEditedReport(companyId: string, date: string, html: string): Promise<{ kind: "ok"; updatedAt: string } | { kind: "no_report" } | { kind: "in_progress" }> {
  const clean = cleanReportHtml(html);
  const sql = db();
  const rows = await sql<{ updated_at: Date }[]>`
    update reports set body_html = ${clean}, title = ${titleOf(clean)}, updated_at = now()
    where company_id = ${companyId} and report_date = ${date}
      and not exists (select 1 from ai_inflight where company_id = ${companyId} and started_at >= now() - ${STALE_INFLIGHT}::interval)
    returning updated_at`;
  if (rows.length) return { kind: "ok", updatedAt: rows[0].updated_at.toISOString() };
  const [exists] = await sql`select 1 from reports where company_id = ${companyId} and report_date = ${date}`;
  return exists ? { kind: "in_progress" } : { kind: "no_report" };
}

async function reserve(companyId: string): Promise<boolean> {
  const rows = await db()`
    insert into ai_inflight (company_id) values (${companyId})
    on conflict (company_id) do update set started_at = now()
      where ai_inflight.started_at < now() - ${STALE_INFLIGHT}::interval
    returning company_id`;
  return rows.length > 0;
}

// 회사가 고른 순서대로 사진 키와 설명을 돌려준다. 설명은 공통 사진에만 있다(PHOTO-1).
async function selectedPhotos(date: string, refs: { source: string; id: string }[]): Promise<{ key: string; description: string }[]> {
  const sharedIds = refs.filter((r) => r.source === "shared").map((r) => r.id);
  const rows = sharedIds.length
    ? await db()<{ id: string; description: string | null }[]>`
        select id, description from shared_files where report_date = ${date} and kind = 'photo' and id = any(${sharedIds}::uuid[])`
    : [];
  const desc = new Map(rows.map((r) => [r.id, r.description ?? ""]));
  return refs.map((r) => ({ key: photoKey(r), description: r.source === "shared" ? (desc.get(r.id) ?? "") : "" }));
}

type GenerationInput = { input: PromptInput; images: ModelRequest["images"]; photoKeys: string[] };

/** 생성과 AI 수정이 같이 쓰는 입력: 회사 정보·자료·일정 이미지·고른 사진 설명. */
async function generationInput(companyId: string, date: string): Promise<GenerationInput> {
  const sql = db();
  const [c] = await sql<{ name: string; traveler: string; business_intro: string; proposal_text: string }[]>`
    select name, traveler, business_intro, proposal_text from companies where id = ${companyId}`;
  const [shared] = await sql<{ schedule_text: string }[]>`select schedule_text from shared_days where report_date = ${date}`;
  const materials = await sql<{ kind: string; filename: string; text_content: string }[]>`
    select kind, filename, text_content from shared_materials where report_date = ${date} order by created_at, id`;
  const images = await sql<{ storage_path: string }[]>`
    select storage_path from shared_files where report_date = ${date} and kind = 'schedule_image' order by created_at, id limit ${MAX_SCHEDULE_IMAGES}`;
  const draft = await getDraft(companyId, date);
  const photos = await selectedPhotos(date, draft?.selected_photos ?? []);
  const pick = (kind: string): Material[] => materials.filter((m) => m.kind === kind).map((m) => ({ filename: m.filename, text: m.text_content }));
  const input: PromptInput = {
    companyName: c.name,
    traveler: c.traveler,
    businessIntro: c.business_intro,
    date,
    proposalText: c.proposal_text,
    scheduleText: draft?.schedule_text ?? shared?.schedule_text ?? "",
    scheduleMaterials: pick("schedule"),
    educationMaterials: pick("education"),
    notes: draft?.notes ?? "",
    hasScheduleImages: images.length > 0,
    photos,
  };
  // 참여 사진은 보내지 않는다(AI-6). 일정 이미지만 보낸다(FUNC-4).
  const bytes = await Promise.all(images.map((i) => getObject(i.storage_path)));
  return {
    input,
    photoKeys: photos.map((p) => p.key),
    images: bytes.map((b, idx) => ({ mediaType: mediaTypeOf(images[idx].storage_path), base64: Buffer.from(b).toString("base64") })),
  };
}

async function promptRequest(companyId: string, date: string): Promise<ModelRequest & { photoKeys: string[] }> {
  const g = await generationInput(companyId, date);
  return {
    model: await aiModel(),
    prompt: buildPrompt(g.input),
    // 같은 자료로 다시 만들 때 이 앞부분(일정 이미지·자료·규칙)을 캐시에서 읽는다(AI-13). AI 수정은 블록 패치(AI-14)로 바뀌어
    // prefix가 달라 이 캐시를 읽지 않는다. 1시간 TTL은 수정이 이 캐시를 읽던 때 정한 값이다.
    cacheTtl: "1h",
    jsonSchema: REPORT_JSON_SCHEMA,
    photoKeys: g.photoKeys,
    images: g.images,
  };
}

function mediaTypeOf(path: string): ModelRequest["images"][number]["mediaType"] {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

// 생성 전용. 응답이 JSON이 아니면 한 번만 다시 부른다(AI-5). 실패한 호출도 토큰은 썼으므로 기록하되 횟수에서는 빼지 않는다(AI-9).
async function callForReport(companyId: string, kind: "generate", req: ModelRequest): Promise<Report | "ai_failed" | "ai_parse_failed"> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let result;
    try {
      result = await callModel(req);
    } catch (e) {
      console.error("AI 호출 실패", { companyId, kind, error: e instanceof Error ? e.message : String(e) });
      await recordUsage({ companyId, kind, model: req.model, inputTokens: 0, outputTokens: 0, success: false });
      return "ai_failed";
    }
    const parsed = parseModelJson(result.text);
    await recordUsage({
      companyId,
      kind,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cacheReadTokens: result.cacheReadTokens,
      cacheWriteTokens: result.cacheWriteTokens,
      success: parsed !== null,
    });
    if (parsed) return normalizeReport(parsed);
  }
  return "ai_parse_failed";
}

export async function generateReport(companyId: string, date: string, overwrite: boolean): Promise<GenerateOutcome> {
  const sql = db();
  const [existing] = await sql`select 1 from reports where company_id = ${companyId} and report_date = ${date}`;
  if (existing && !overwrite) return { kind: "report_exists" };
  if (!canGenerate(await usageCounts(companyId))) return { kind: "limit_reached" };
  if (!(await reserve(companyId))) return { kind: "in_progress" };
  try {
    const req = await promptRequest(companyId, date);
    const report = await callForReport(companyId, "generate", req);
    if (typeof report === "string") return { kind: report };
    const bodyHtml = renderReportHtml(report, req.photoKeys);
    const draft = await getDraft(companyId, date);
    const [row] = await sql.begin(async (tx) => {
      const rows = await tx<{ id: string; updated_at: Date }[]>`
        insert into reports (company_id, report_date, title, body_html, schedule_text, notes)
        values (${companyId}, ${date}, ${report.title}, ${bodyHtml}, ${draft?.schedule_text ?? ""}, ${draft?.notes ?? ""})
        on conflict (company_id, report_date) do update set title = excluded.title, body_html = excluded.body_html,
          schedule_text = excluded.schedule_text, notes = excluded.notes, updated_at = now()
        returning id, updated_at`;
      // 지난 수정 요청은 새로 만든 보고서와 맞지 않으므로 지운다(FUNC-10)
      await tx`delete from report_revisions where report_id = ${rows[0].id}`;
      return rows;
    });
    return { kind: "ok", report: { title: report.title, bodyHtml, updatedAt: row.updated_at.toISOString() }, usage: usageView(await usageCounts(companyId)) };
  } finally {
    await sql`delete from ai_inflight where company_id = ${companyId}`;
  }
}

export async function listRevisions(companyId: string, date: string): Promise<Revision[]> {
  const rows = await db()<{ request: string; created_at: Date }[]>`
    select v.request, v.created_at from report_revisions v join reports r on r.id = v.report_id
    where r.company_id = ${companyId} and r.report_date = ${date} order by v.id`;
  return rows.map((r) => ({ request: r.request, createdAt: r.created_at.toISOString() }));
}

/** 수정 한 건의 사용량. 턴이 여러 번이어도 한 행으로 합친다: 토큰은 턴 합계, model은 마지막 턴. */
function revisionUsage(companyId: string, fallbackModel: string, usages: TurnUsage[], success: boolean): UsageEntry {
  const sum = (f: (u: TurnUsage) => number) => usages.reduce((n, u) => n + f(u), 0);
  return {
    companyId,
    kind: "revise",
    model: usages.at(-1)?.model ?? fallbackModel,
    inputTokens: sum((u) => u.input),
    outputTokens: sum((u) => u.output),
    cacheReadTokens: sum((u) => u.cacheRead),
    cacheWriteTokens: sum((u) => u.cacheWrite),
    success,
  };
}

type DomNode = ReturnType<typeof parseDocument>["children"][number];
/** 태그·속성·풀어 쓴 텍스트만 남긴 구조. 엔티티 표기(&quot; 와 ")만 다른 두 HTML은 같은 값이 된다. */
function shape(nodes: DomNode[]): unknown[] {
  return nodes.map((n) =>
    n.type === "text" ? n.data : n.type === "tag" ? [n.name, Object.entries(n.attribs).sort(), shape(n.children as DomNode[])] : [n.type],
  );
}
const sameShape = (a: string, b: string) => JSON.stringify(shape(parseDocument(a).children)) === JSON.stringify(shape(parseDocument(b).children));

/**
 * 수정 결과를 저장할 HTML로 만든다. 수정 전과 바이트가 같은 블록은 정리해도 엔티티 표기만 바뀌면 원문을 둔다.
 * 생성 본문은 따옴표를 &quot;로 저장하고 cleanReportHtml은 "로 바꾸므로, 문서 전체를 정리하면 요청하지 않은 블록도 바이트가 바뀐다.
 * 정리로 태그·속성이 빠지는 블록(저장본에 남은 위험한 마크업 포함)과 새로 생기거나 바뀐 블록은 정리한 결과를 쓴다.
 */
function mergeRevised(before: BlockDoc, html: string): string {
  const kept = new Set(before.blocks.map((b) => b.html));
  return parseBlocks(html)
    .blocks.map((b) => {
      const clean = cleanReportHtml(b.html);
      return kept.has(b.html) && sameShape(b.html, clean) ? b.html : clean;
    })
    .join("");
}

/**
 * 저장된 현재 보고서(직접 고친 내용 포함)를 블록으로 나눠 보내고, 이번 요청이 가리키는 블록만 tool로 바꾼다(FUNC-10).
 * 손대지 않은 블록은 원문 바이트 그대로 저장된다. 지난 수정 요청 전체도 함께 보낸다.
 */
export async function reviseReport(companyId: string, date: string, request: string): Promise<ReviseOutcome> {
  const started = Date.now();
  const sql = db();
  const [current] = await sql<{ id: string; body_html: string }[]>`
    select id, body_html from reports where company_id = ${companyId} and report_date = ${date}`;
  if (!current) return { kind: "no_report" };
  if (!canRevise(await usageCounts(companyId))) return { kind: "limit_reached" };
  if (!(await reserve(companyId))) return { kind: "in_progress" };
  try {
    const g = await generationInput(companyId, date);
    const model = await aiModel();
    const previous = await listRevisions(companyId, date);
    const doc = parseBlocks(current.body_html);
    // 루프 시작 전(일정 이미지 받기 등)에 쓴 시간을 빼고 루프에 넘긴다
    const deadlineMs = DEADLINE_MS - (Date.now() - started);
    if (deadlineMs < MIN_AGENT_MS) {
      console.error("AI 수정 시간 부족", { companyId, deadlineMs });
      return { kind: "ai_failed" };
    }
    let r: AgentResult;
    try {
      r = await runReportAgent({
        mode: "revise",
        model,
        // 생성 입력과 양식만으로 만든 캐시 prefix. 수정 요청·현재 문서는 followUp(캐시 밖)에만 둔다.
        prompt: buildAgentPrompt(g.input, GMEP_DAILY),
        followUp: buildAgentRevision({ numberedDoc: numberedForModel(doc, g.photoKeys), previousRequests: previous.map((x) => x.request), request }),
        images: g.images,
        template: GMEP_DAILY,
        photoKeys: g.photoKeys,
        doc,
        limits: { deadlineMs },
        onEvent: () => {},
      });
    } catch (e) {
      // runReportAgent는 스트림 예외(ModelStreamError 등)를 결과로 바꾸지만, 그 밖의 예외도 실패로 기록한다
      const usages = e instanceof ModelStreamError && e.usage ? [{ ...e.usage, model: e.model ?? model, latencyMs: 0, firstToolMs: null }] : [];
      r = { ok: false, reason: "ai_failed", usages };
    }
    // 하루 수정 횟수(AI-9)는 성공한 revise 행 수로 센다. 턴마다 행을 넣으면 한 번의 요청이 여러 번으로 세지므로 요청 하나에 한 행만 넣는다.
    // 실패해도 쓴 토큰은 월 합계에 들어가야 하므로 success=false로 기록한다(AI-12).
    if (!r.ok) {
      await recordUsage(revisionUsage(companyId, model, r.usages, false));
      console.error("AI 수정 실패", { companyId, reason: r.reason });
      return { kind: r.reason === "max_tokens" ? "ai_parse_failed" : "ai_failed" };
    }
    const bodyHtml = mergeRevised(doc, r.html);
    const title = titleOf(bodyHtml);
    let row: { updated_at: Date };
    try {
      [row] = await sql.begin(async (tx) => {
        const rows = await tx<{ updated_at: Date }[]>`
          update reports set title = ${title}, body_html = ${bodyHtml}, updated_at = now() where id = ${current.id} returning updated_at`;
        await tx`insert into report_revisions (report_id, request) values (${current.id}, ${request})`;
        return rows;
      });
    } catch (e) {
      // 저장하지 못한 수정은 횟수에서 빼지 않는다. 성공으로 먼저 기록하면 보고서는 그대로인데 횟수만 줄어든다.
      await recordUsage(revisionUsage(companyId, model, r.usages, false));
      console.error("AI 수정 저장 실패", { companyId, error: e instanceof Error ? e.message : String(e) });
      return { kind: "ai_failed" };
    }
    await recordUsage(revisionUsage(companyId, model, r.usages, true));
    return {
      kind: "ok",
      report: { title, bodyHtml, updatedAt: row.updated_at.toISOString() },
      usage: usageView(await usageCounts(companyId)),
      revisions: await listRevisions(companyId, date),
    };
  } finally {
    await sql`delete from ai_inflight where company_id = ${companyId}`;
  }
}
