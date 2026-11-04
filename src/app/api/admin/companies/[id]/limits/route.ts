import { requireAdmin } from "@/server/auth";
import { setCompanyLimits } from "@/server/companies";
import { parseDailyLimits } from "@/server/domain/usage";
import { badRequest, isUuid, notFound, ok, readJson } from "@/server/http";

// 회사별 하루 생성·수정 횟수 한도(AI-9). 이미 쓴 횟수는 그대로 두고 남은 횟수만 새 한도로 다시 계산된다.
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/companies/[id]/limits">) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const limits = parseDailyLimits(await readJson(req));
  if (!limits) return badRequest("하루 생성·수정 횟수를 0~100 사이 정수로 입력해 주세요");
  return (await setCompanyLimits(id, limits)) ? ok({ ok: true }) : notFound();
}
