import { requireCompany } from "@/server/auth";
import { ok } from "@/server/http";
import { listReports } from "@/server/workspace";

// 회사 id는 세션에서만 읽는다. 쿼리의 companyId 등은 쓰지 않는다(AUTH-8).
export async function GET(req: Request) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  return ok({ reports: await listReports(s.companyId) });
}
