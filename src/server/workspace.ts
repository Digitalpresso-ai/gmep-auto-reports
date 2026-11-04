import "server-only";
import { db } from "./db";
import { usageView, type UsageView } from "./domain/usage";
import type { UploadedImage } from "./photos";
import { getSharedDay } from "./shared-days";
import { signedUrls } from "./storage";
import { usageCounts } from "./usage";

export type PhotoRef = { source: "shared" | "company"; id: string };
export type PhotoView = PhotoRef & { filename: string; width: number; height: number; url: string };
export type ResolvedPhoto = PhotoRef & { storagePath: string; width: number; height: number };

export const MAX_NOTES_CHARS = 5_000;

export type DayView = {
  date: string;
  hasShared: boolean;
  // 한 번도 저장하지 않은 초안이면 브라우저가 후보 4장 이하를 자동 선택한다(FUNC-6)
  draftSaved: boolean;
  schedule: { text: string; edited: boolean };
  scheduleImages: { id: string; url: string; filename: string }[];
  materials: { id: string; kind: "schedule" | "education"; filename: string; chars: number; hasOriginal: boolean }[];
  photos: PhotoView[];
  selectedPhotos: PhotoRef[];
  notes: string;
  report: { title: string; updatedAt: string } | null;
  usage: UsageView;
};

type DraftRow = { schedule_text: string | null; selected_photos: PhotoRef[]; notes: string };

export async function getDraft(companyId: string, date: string): Promise<DraftRow | null> {
  const [d] = await db()<DraftRow[]>`select schedule_text, selected_photos, notes from drafts where company_id = ${companyId} and report_date = ${date}`;
  return d ?? null;
}

async function companyPhotos(companyId: string, date: string) {
  return db()<{ id: string; filename: string; width: number; height: number; storage_path: string }[]>`
    select id, filename, width, height, storage_path from company_photos
    where company_id = ${companyId} and report_date = ${date} order by created_at, id`;
}

export async function getDayView(companyId: string, date: string): Promise<DayView> {
  const [shared, draft, own, usage] = await Promise.all([getSharedDay(date), getDraft(companyId, date), companyPhotos(companyId, date), usageCounts(companyId)]);
  const [report] = await db()<{ title: string; updated_at: Date }[]>`
    select title, updated_at from reports where company_id = ${companyId} and report_date = ${date}`;
  const ownUrls = await signedUrls(own.map((p) => p.storage_path));
  const sharedPhotos = (shared?.files ?? []).filter((f) => f.kind === "photo");
  // 관리자가 지운 공통 사진이 초안에 남아 있으면 브라우저가 그대로 다시 보내 저장이 거부되므로 여기서 뺀다
  const exists = new Set([...sharedPhotos.map((f) => `shared:${f.id}`), ...own.map((p) => `company:${p.id}`)]);
  return {
    date,
    hasShared: shared !== null,
    draftSaved: draft !== null,
    schedule: draft?.schedule_text != null ? { text: draft.schedule_text, edited: true } : { text: shared?.scheduleText ?? "", edited: false },
    scheduleImages: (shared?.files ?? []).filter((f) => f.kind === "schedule_image").map((f) => ({ id: f.id, url: f.url, filename: f.filename })),
    materials: shared?.materials ?? [],
    photos: [
      ...sharedPhotos.map((f) => ({ source: "shared" as const, id: f.id, filename: f.filename, width: f.width, height: f.height, url: f.url })),
      ...own.map((p) => ({ source: "company" as const, id: p.id, filename: p.filename, width: p.width, height: p.height, url: ownUrls.get(p.storage_path) ?? "" })),
    ],
    selectedPhotos: (draft?.selected_photos ?? []).filter((r) => exists.has(`${r.source}:${r.id}`)),
    notes: draft?.notes ?? "",
    report: report ? { title: report.title, updatedAt: report.updated_at.toISOString() } : null,
    usage: usageView(usage),
  };
}

export type ReportSummary = { date: string; title: string; updatedAt: string };

/** 회사의 보고서를 최근 날짜부터. 목록에는 본문을 싣지 않는다. */
export async function listReports(companyId: string): Promise<ReportSummary[]> {
  const rows = await db()<{ date: string; title: string; updated_at: Date }[]>`
    select to_char(report_date, 'YYYY-MM-DD') as date, title, updated_at from reports
    where company_id = ${companyId} order by report_date desc`;
  return rows.map((r) => ({ date: r.date, title: r.title, updatedAt: r.updated_at.toISOString() }));
}

/** 회사가 볼 수 있는 사진만 선택 순서대로 돌려준다. 하나라도 볼 수 없으면 null(AUTH-8, SHARED-3). */
export async function resolvePhotos(companyId: string, date: string, refs: PhotoRef[]): Promise<ResolvedPhoto[] | null> {
  if (!refs.length) return [];
  const sharedIds = refs.filter((r) => r.source === "shared").map((r) => r.id);
  const ownIds = refs.filter((r) => r.source === "company").map((r) => r.id);
  const sql = db();
  const shared = sharedIds.length
    ? await sql<{ id: string; storage_path: string; width: number; height: number }[]>`
        select id, storage_path, width, height from shared_files where kind = 'photo' and report_date = ${date} and id = any(${sharedIds}::uuid[])`
    : [];
  const own = ownIds.length
    ? await sql<{ id: string; storage_path: string; width: number; height: number }[]>`
        select id, storage_path, width, height from company_photos where company_id = ${companyId} and report_date = ${date} and id = any(${ownIds}::uuid[])`
    : [];
  const byKey = new Map([...shared.map((r) => [`shared:${r.id}`, r] as const), ...own.map((r) => [`company:${r.id}`, r] as const)]);
  const out: ResolvedPhoto[] = [];
  for (const ref of refs) {
    const r = byKey.get(`${ref.source}:${ref.id}`);
    if (!r) return null;
    out.push({ ...ref, storagePath: r.storage_path, width: r.width, height: r.height });
  }
  return out;
}

export type DraftPatch = { scheduleText?: string; selectedPhotos?: PhotoRef[]; notes?: string };

export async function saveDraft(companyId: string, date: string, patch: DraftPatch): Promise<void> {
  const sql = db();
  await sql`insert into drafts (company_id, report_date) values (${companyId}, ${date}) on conflict do nothing`;
  if (patch.scheduleText !== undefined) await sql`update drafts set schedule_text = ${patch.scheduleText}, updated_at = now() where company_id = ${companyId} and report_date = ${date}`;
  if (patch.selectedPhotos !== undefined) await sql`update drafts set selected_photos = ${sql.json(patch.selectedPhotos)}, updated_at = now() where company_id = ${companyId} and report_date = ${date}`;
  if (patch.notes !== undefined) await sql`update drafts set notes = ${patch.notes}, updated_at = now() where company_id = ${companyId} and report_date = ${date}`;
}

export async function addCompanyPhoto(companyId: string, date: string, img: UploadedImage): Promise<string> {
  const [row] = await db()<{ id: string }[]>`
    insert into company_photos (company_id, report_date, storage_path, filename, width, height)
    values (${companyId}, ${date}, ${img.storagePath}, ${img.filename}, ${img.width}, ${img.height}) returning id`;
  return row.id;
}

export async function deleteCompanyPhoto(companyId: string, date: string, id: string): Promise<string | null> {
  const sql = db();
  return sql.begin(async (tx) => {
    const [row] = await tx<{ storage_path: string }[]>`
      delete from company_photos where id = ${id} and company_id = ${companyId} and report_date = ${date} returning storage_path`;
    if (!row) return null;
    await tx`update drafts set selected_photos = coalesce(
               (select jsonb_agg(e) from jsonb_array_elements(selected_photos) e where not (e->>'source' = 'company' and e->>'id' = ${id})), '[]'::jsonb)
             where company_id = ${companyId} and report_date = ${date}`;
    return row.storage_path;
  });
}
