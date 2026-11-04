import "server-only";
import { callModel, type ModelRequest } from "./ai";
import { db } from "./db";
import { buildPrompt, buildRevisionFollowUp, htmlWithPhotoNumbers, type Material, type PromptInput } from "./domain/prompt";
import { REPORT_JSON_SCHEMA, normalizeReport, parseModelJson, renderReportHtml, type Report } from "./domain/report";
import { photoKey } from "@/lib/photo-layout";
import { canGenerate, canRevise, usageView, type UsageView } from "./domain/usage";
import { aiModel } from "./settings";
import { getObject } from "./storage";
import { usageCounts, recordUsage } from "./usage";
import { getDraft } from "./workspace";

const MAX_SCHEDULE_IMAGES = 8;
// 함수가 비정상 종료해 남은 진행 기록은 이 시간이 지나면 무시한다
const STALE_INFLIGHT = "5 minutes";

type ReportView = { title: string; bodyHtml: string; updatedAt: string };
type AiFailure = { kind: "limit_reached" | "in_progress" | "ai_failed" | "ai_parse_failed" };

export type GenerateOutcome = { kind: "ok"; report: ReportView; usage: UsageView } | { kind: "report_exists" } | AiFailure;

export type Revision = { request: string; createdAt: string };
export type ReviseOutcome = { kind: "ok"; report: ReportView; usage: UsageView; revisions: Revision[] } | { kind: "no_report" } | AiFailure;

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
    // 같은 자료로 다시 만들거나 AI로 고칠 때 이 앞부분(일정 이미지·자료·규칙)을 캐시에서 읽는다. 생성 1~3분과
    // 회사가 보고서를 읽고 수정을 요청하기까지의 간격이 5분을 넘기 쉬워 1시간 캐시를 쓴다(AI-13).
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

// 응답이 JSON이 아니면 한 번만 다시 부른다(AI-5). 실패한 호출도 토큰은 썼으므로 기록하되 횟수에서는 빼지 않는다(AI-9).
async function callForReport(companyId: string, kind: "generate" | "revise", req: ModelRequest): Promise<Report | "ai_failed" | "ai_parse_failed"> {
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

/** 저장된 현재 보고서(직접 고친 내용 포함)와 지난 수정 요청 전체를 보내 이번 요청만 반영한 보고서로 바꾼다(FUNC-10). */
export async function reviseReport(companyId: string, date: string, request: string): Promise<ReviseOutcome> {
  const sql = db();
  const [current] = await sql<{ id: string; body_html: string }[]>`
    select id, body_html from reports where company_id = ${companyId} and report_date = ${date}`;
  if (!current) return { kind: "no_report" };
  if (!canRevise(await usageCounts(companyId))) return { kind: "limit_reached" };
  if (!(await reserve(companyId))) return { kind: "in_progress" };
  try {
    const req = await promptRequest(companyId, date);
    const previous = await listRevisions(companyId, date);
    const followUp = buildRevisionFollowUp({
      currentHtml: htmlWithPhotoNumbers(current.body_html, req.photoKeys),
      previousRequests: previous.map((r) => r.request),
      request,
    });
    const report = await callForReport(companyId, "revise", { ...req, followUp });
    if (typeof report === "string") return { kind: report };
    const bodyHtml = renderReportHtml(report, req.photoKeys);
    const [row] = await sql.begin(async (tx) => {
      const rows = await tx<{ updated_at: Date }[]>`
        update reports set title = ${report.title}, body_html = ${bodyHtml}, updated_at = now() where id = ${current.id} returning updated_at`;
      await tx`insert into report_revisions (report_id, request) values (${current.id}, ${request})`;
      return rows;
    });
    return {
      kind: "ok",
      report: { title: report.title, bodyHtml, updatedAt: row.updated_at.toISOString() },
      usage: usageView(await usageCounts(companyId)),
      revisions: await listRevisions(companyId, date),
    };
  } finally {
    await sql`delete from ai_inflight where company_id = ${companyId}`;
  }
}
