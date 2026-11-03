import { COMPANY_COOKIE, logoutCompany } from "@/server/auth";
import { clearCookie, ok } from "@/server/http";

export async function POST(req: Request) {
  await logoutCompany(req);
  return clearCookie(ok({ ok: true }), COMPANY_COOKIE);
}
