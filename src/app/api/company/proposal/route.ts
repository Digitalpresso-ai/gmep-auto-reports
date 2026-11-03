import { requireCompany } from "@/server/auth";
import { db } from "@/server/db";
import { badRequest, ok, readJson, str } from "@/server/http";
import { isOwnedPath } from "@/server/originals";
import { removeObjects } from "@/server/storage";

// AI에는 브라우저에서 추출한 텍스트를 15,000자까지만 보낸다(AI-8). 원본은 다시 내려받는 용도로 Storage에 둔다.
const MAX_PROPOSAL = 100_000;

export async function GET(req: Request) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const [c] = await db()<{ proposal_filename: string | null; proposal_text: string }[]>`
    select proposal_filename, proposal_text from companies where id = ${s.companyId}`;
  return ok({ filename: c.proposal_filename, text: c.proposal_text });
}

export async function PUT(req: Request) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const body = await readJson(req);
  const filename = str(body?.filename)?.trim().slice(0, 200);
  const text = str(body?.text);
  const storagePath = body?.storagePath ?? null;
  if (!filename) return badRequest("파일 이름이 없습니다");
  if (!text?.trim()) return badRequest("기안문에서 글자를 읽지 못했습니다. PDF·DOCX 파일인지 확인해 주세요");
  if (text.length > MAX_PROPOSAL) return badRequest("기안문이 너무 깁니다");
  if (storagePath !== null && !isOwnedPath(storagePath, `companies/${s.companyId}/proposal`)) return badRequest("원본 파일 경로가 잘못되었습니다");
  const [prev] = await db()<{ proposal_storage_path: string | null }[]>`select proposal_storage_path from companies where id = ${s.companyId}`;
  await db()`update companies set proposal_filename = ${filename}, proposal_text = ${text}, proposal_storage_path = ${storagePath}, updated_at = now() where id = ${s.companyId}`;
  if (prev.proposal_storage_path && prev.proposal_storage_path !== storagePath) await removeObjects([prev.proposal_storage_path]);
  return ok({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const [prev] = await db()<{ proposal_storage_path: string | null }[]>`
    update companies c set proposal_filename = null, proposal_text = '', proposal_storage_path = null, updated_at = now()
    from (select proposal_storage_path from companies where id = ${s.companyId}) old
    where c.id = ${s.companyId} returning old.proposal_storage_path`;
  if (prev?.proposal_storage_path) await removeObjects([prev.proposal_storage_path]);
  return ok({ ok: true });
}
