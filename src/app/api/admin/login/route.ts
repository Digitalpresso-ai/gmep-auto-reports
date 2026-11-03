import { ADMIN_COOKIE, SESSION_SECONDS, loginAdmin } from "@/server/auth";
import { fail, ok, readJson, setSessionCookie, str } from "@/server/http";

export async function POST(req: Request) {
  const body = await readJson(req);
  const r = await loginAdmin(str(body?.password) ?? "");
  switch (r.kind) {
    case "ok":
      return setSessionCookie(ok({ ok: true }), ADMIN_COOKIE, r.token, SESSION_SECONDS);
    case "locked":
      return fail(423, "locked", "비밀번호를 5회 틀려 15분 동안 로그인할 수 없습니다", { lockedUntil: r.lockedUntil.toISOString() });
    case "not_configured":
      return fail(503, "not_configured", "관리자 비밀번호가 아직 설정되지 않았습니다(npm run admin:password)");
    case "wrong":
      return fail(401, "wrong_password", "비밀번호가 맞지 않습니다");
  }
}
