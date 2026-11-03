import "server-only";
import { callModel, type ModelRequest } from "./ai";
import { db } from "./db";
import { buildPrompt, type Material } from "./domain/prompt";
import { REPORT_JSON_SCHEMA, normalizeReport, parseModelJson, renderReportHtml } from "./domain/report";
import { photoKey } from "@/lib/photo-layout";
import { canGenerate, usageView, type UsageView } from "./domain/usage";
import { aiModel } from "./settings";
import { getObject } from "./storage";
import { usageCounts, recordUsage } from "./usage";
import { getDraft } from "./workspace";

const MAX_SCHEDULE_IMAGES = 8;
// 함수가 비정상 종료해 남은 진행 기록은 이 시간이 지나면 무시한다
const STALE_INFLIGHT = "5 minutes";

export type GenerateOutcome =
  | { kind: "ok"; report: { title: string; bodyHtml: string; updatedAt: string }; usage: UsageView }
  | { kind: "report_exists" | "limit_reached" | "in_progress" | "ai_failed" | "ai_parse_failed" };

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

async function promptRequest(companyId: string, date: string): Promise<ModelRequest & { photoKeys: string[] }> {
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
  const prompt = buildPrompt({
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
  });
  // 참여 사진은 보내지 않는다(AI-6). 일정 이미지만 보낸다(FUNC-4).
  const bytes = await Promise.all(images.map((i) => getObject(i.storage_path)));
  return {
    model: await aiModel(),
    prompt,
    jsonSchema: REPORT_JSON_SCHEMA,
    photoKeys: photos.map((p) => p.key),
    images: bytes.map((b, idx) => ({ mediaType: mediaTypeOf(images[idx].storage_path), base64: Buffer.from(b).toString("base64") })),
  };
}

function mediaTypeOf(path: string): ModelRequest["images"][number]["mediaType"] {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function generateReport(companyId: string, date: string, overwrite: boolean): Promise<GenerateOutcome> {
  const sql = db();
  const [existing] = await sql`select 1 from reports where company_id = ${companyId} and report_date = ${date}`;
  if (existing && !overwrite) return { kind: "report_exists" };
  if (!canGenerate(await usageCounts(companyId))) return { kind: "limit_reached" };
  if (!(await reserve(companyId))) return { kind: "in_progress" };
  try {
    const req = await promptRequest(companyId, date);
    // 응답이 JSON이 아니면 한 번만 다시 부른다(AI-5)
    for (let attempt = 0; attempt < 2; attempt++) {
      let result;
      try {
        result = await callModel(req);
      } catch (e) {
        console.error("AI 호출 실패", { companyId, date, error: e instanceof Error ? e.message : String(e) });
        await recordUsage({ companyId, kind: "generate", model: req.model, inputTokens: 0, outputTokens: 0, success: false });
        return { kind: "ai_failed" };
      }
      const parsed = parseModelJson(result.text);
      await recordUsage({ companyId, kind: "generate", model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, success: parsed !== null });
      if (!parsed) continue;
      const report = normalizeReport(parsed);
      const bodyHtml = renderReportHtml(report, req.photoKeys);
      const draft = await getDraft(companyId, date);
      const [row] = await sql<{ updated_at: Date }[]>`
        insert into reports (company_id, report_date, title, body_html, schedule_text, notes)
        values (${companyId}, ${date}, ${report.title}, ${bodyHtml}, ${draft?.schedule_text ?? ""}, ${draft?.notes ?? ""})
        on conflict (company_id, report_date) do update set title = excluded.title, body_html = excluded.body_html,
          schedule_text = excluded.schedule_text, notes = excluded.notes, updated_at = now()
        returning updated_at`;
      return { kind: "ok", report: { title: report.title, bodyHtml, updatedAt: row.updated_at.toISOString() }, usage: usageView(await usageCounts(companyId)) };
    }
    return { kind: "ai_parse_failed" };
  } finally {
    await sql`delete from ai_inflight where company_id = ${companyId}`;
  }
}
