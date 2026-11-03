import { requireCompany } from "@/server/auth";
import { db } from "@/server/db";
import { badRequest, ok, readJson } from "@/server/http";

const MAX_INTRO = 5_000;
const MAX_TRAVELER = 300;

// 회사명은 관리자만 고친다(COMP-2). 회사는 출장자·회사 소개만 바꾼다.
export async function PUT(req: Request) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const body = await readJson(req);
  if (!body) return badRequest("입력 형식이 잘못되었습니다");
  const { traveler, businessIntro } = body;
  if (traveler !== undefined && (typeof traveler !== "string" || traveler.length > MAX_TRAVELER)) return badRequest(`출장자는 ${MAX_TRAVELER}자 이내로 입력해 주세요`);
  if (businessIntro !== undefined && (typeof businessIntro !== "string" || businessIntro.length > MAX_INTRO)) return badRequest("회사 소개는 5,000자 이내로 입력해 주세요");
  const sql = db();
  if (typeof traveler === "string") await sql`update companies set traveler = ${traveler}, updated_at = now() where id = ${s.companyId}`;
  if (typeof businessIntro === "string") await sql`update companies set business_intro = ${businessIntro}, updated_at = now() where id = ${s.companyId}`;
  return ok({ ok: true });
}
