import { changeCompanyPassword, companySession } from "@/server/auth";
import { badRequest, fail, ok, readJson, str } from "@/server/http";

export async function POST(req: Request) {
  const s = await companySession(req);
  if (!s) return fail(401, "unauthenticated", "다시 로그인해 주세요");
  const body = await readJson(req);
  const r = await changeCompanyPassword(s, str(body?.currentPassword), str(body?.newPassword) ?? "");
  return r.ok ? ok({ ok: true }) : badRequest(r.message);
}
