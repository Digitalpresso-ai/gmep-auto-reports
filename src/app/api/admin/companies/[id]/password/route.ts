import { requireAdmin } from "@/server/auth";
import { issueInitialPassword } from "@/server/companies";
import { isUuid, notFound, ok } from "@/server/http";

// 발급한 초기 비밀번호는 이 응답에서 한 번만 보여 주고 저장하지 않는다
export async function POST(req: Request, ctx: RouteContext<"/api/admin/companies/[id]/password">) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const password = await issueInitialPassword(id);
  return password ? ok({ password }) : notFound();
}
