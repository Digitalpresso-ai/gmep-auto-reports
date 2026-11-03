import { ADMIN_COOKIE, logoutAdmin } from "@/server/auth";
import { clearCookie, ok } from "@/server/http";

export async function POST(req: Request) {
  await logoutAdmin(req);
  return clearCookie(ok({ ok: true }), ADMIN_COOKIE);
}
