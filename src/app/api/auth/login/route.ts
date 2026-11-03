import { COMPANY_COOKIE, SESSION_SECONDS, loginCompany } from "@/server/auth";
import { fail, ok, readJson, setSessionCookie, str } from "@/server/http";

export async function POST(req: Request) {
  const body = await readJson(req);
  const r = await loginCompany(body?.companyId, str(body?.password) ?? "");
  switch (r.kind) {
    case "ok":
      return setSessionCookie(ok({ mustChangePassword: r.mustChangePassword }), COMPANY_COOKIE, r.token, SESSION_SECONDS);
    case "locked":
      return fail(423, "locked", "비밀번호를 5회 틀려 15분 동안 로그인할 수 없습니다", { lockedUntil: r.lockedUntil.toISOString() });
    case "no_password":
      return fail(403, "no_password", "아직 초기 비밀번호가 발급되지 않았습니다. 운영 담당자에게 문의해 주세요");
    case "wrong":
      return fail(401, "wrong_password", r.remaining > 0 ? `비밀번호가 맞지 않습니다 (${r.remaining}회 더 틀리면 15분 잠금)` : "비밀번호가 맞지 않습니다", { remaining: r.remaining });
  }
}
