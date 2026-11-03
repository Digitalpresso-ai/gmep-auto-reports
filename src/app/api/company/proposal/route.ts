import { requireCompany } from "@/server/auth";
import { db } from "@/server/db";
import { badRequest, ok, readJson, str } from "@/server/http";

// 기안문은 브라우저에서 추출한 텍스트만 저장한다. AI에는 15,000자까지만 보낸다(AI-8).
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
  if (!filename) return badRequest("파일 이름이 없습니다");
  if (!text?.trim()) return badRequest("기안문에서 글자를 읽지 못했습니다. PDF·DOCX 파일인지 확인해 주세요");
  if (text.length > MAX_PROPOSAL) return badRequest("기안문이 너무 깁니다");
  await db()`update companies set proposal_filename = ${filename}, proposal_text = ${text}, updated_at = now() where id = ${s.companyId}`;
  return ok({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  await db()`update companies set proposal_filename = null, proposal_text = '', updated_at = now() where id = ${s.companyId}`;
  return ok({ ok: true });
}
