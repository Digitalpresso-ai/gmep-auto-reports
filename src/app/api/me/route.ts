import { companySession } from "@/server/auth";
import { getCompanyProfile } from "@/server/companies";
import { fail, ok } from "@/server/http";

export async function GET(req: Request) {
  const s = await companySession(req);
  if (!s) return fail(401, "unauthenticated", "다시 로그인해 주세요");
  return ok({ mustChangePassword: s.mustChangePassword, company: await getCompanyProfile(s.companyId) });
}
