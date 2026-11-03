import "server-only";
import { db } from "./db";
import type { UploadedImage } from "./photos";
import { removeObjects, signedUrls } from "./storage";

export const MAX_SCHEDULE_CHARS = 20_000;
export const MAX_MATERIAL_CHARS = 200_000;

export type SharedFile = { id: string; kind: "schedule_image" | "photo"; filename: string; width: number; height: number; url: string; storagePath: string };
export type SharedMaterial = { id: string; kind: "schedule" | "education"; filename: string; chars: number; hasOriginal: boolean };
export type SharedDay = { date: string; scheduleText: string; files: SharedFile[]; materials: SharedMaterial[] };

export async function listSharedDays() {
  return db()<{ date: string; hasSchedule: boolean; photos: number; scheduleImages: number; materials: number }[]>`
    select to_char(d.report_date, 'YYYY-MM-DD') as date,
           (d.schedule_text <> '') as "hasSchedule",
           (select count(*)::int from shared_files f where f.report_date = d.report_date and f.kind = 'photo') as photos,
           (select count(*)::int from shared_files f where f.report_date = d.report_date and f.kind = 'schedule_image') as "scheduleImages",
           (select count(*)::int from shared_materials m where m.report_date = d.report_date) as materials
    from shared_days d order by d.report_date desc`;
}

export async function getSharedDay(date: string): Promise<SharedDay | null> {
  const sql = db();
  const [day] = await sql<{ schedule_text: string }[]>`select schedule_text from shared_days where report_date = ${date}`;
  if (!day) return null;
  const files = await sql<{ id: string; kind: SharedFile["kind"]; filename: string; width: number; height: number; storage_path: string }[]>`
    select id, kind, filename, width, height, storage_path from shared_files where report_date = ${date} order by created_at, id`;
  const materials = await sql<SharedMaterial[]>`
    select id, kind, filename, char_length(text_content)::int as chars, (storage_path is not null) as "hasOriginal" from shared_materials where report_date = ${date} order by created_at, id`;
  const urls = await signedUrls(files.map((f) => f.storage_path));
  return {
    date,
    scheduleText: day.schedule_text,
    files: files.map((f) => ({ id: f.id, kind: f.kind, filename: f.filename, width: f.width, height: f.height, storagePath: f.storage_path, url: urls.get(f.storage_path) ?? "" })),
    materials: [...materials],
  };
}

async function ensureDay(date: string) {
  await db()`insert into shared_days (report_date) values (${date}) on conflict do nothing`;
}

export async function setSharedSchedule(date: string, text: string) {
  await db()`insert into shared_days (report_date, schedule_text) values (${date}, ${text})
             on conflict (report_date) do update set schedule_text = excluded.schedule_text, updated_at = now()`;
}

export async function addSharedFile(date: string, kind: SharedFile["kind"], img: UploadedImage): Promise<string> {
  await ensureDay(date);
  const [row] = await db()<{ id: string }[]>`
    insert into shared_files (report_date, kind, storage_path, filename, width, height)
    values (${date}, ${kind}, ${img.storagePath}, ${img.filename}, ${img.width}, ${img.height}) returning id`;
  return row.id;
}

export const materialsFolder = (date: string) => `shared/${date}/materials`;

export async function addSharedMaterial(date: string, kind: SharedMaterial["kind"], filename: string, text: string, storagePath: string | null): Promise<string> {
  await ensureDay(date);
  const [row] = await db()<{ id: string }[]>`
    insert into shared_materials (report_date, kind, filename, text_content, storage_path)
    values (${date}, ${kind}, ${filename}, ${text}, ${storagePath}) returning id`;
  return row.id;
}

// 회사 보고서가 이 사진을 이미 고른 경우가 있어 저장소 객체는 남기고 목록에서만 뺀다. 객체는 종료 시 일괄 삭제한다(OPS-4).
export async function deleteSharedFile(date: string, id: string): Promise<boolean> {
  const rows = await db()`delete from shared_files where report_date = ${date} and id = ${id} returning id`;
  return rows.length > 0;
}

// 교육자료 원본은 보고서가 참조하지 않으므로 목록에서 지울 때 함께 지운다
export async function deleteSharedMaterial(date: string, id: string): Promise<boolean> {
  const rows = await db()<{ storage_path: string | null }[]>`delete from shared_materials where report_date = ${date} and id = ${id} returning storage_path`;
  if (rows[0]?.storage_path) await removeObjects([rows[0].storage_path]);
  return rows.length > 0;
}

export async function materialOriginal(date: string, id: string): Promise<{ path: string; filename: string } | null> {
  const [row] = await db()<{ storage_path: string | null; filename: string }[]>`
    select storage_path, filename from shared_materials where report_date = ${date} and id = ${id}`;
  return row?.storage_path ? { path: row.storage_path, filename: row.filename } : null;
}
