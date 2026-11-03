import { requireCompany } from "@/server/auth";
import { isIsoDate } from "@/server/domain/dates";
import { badRequest, ok } from "@/server/http";
import { getDayView } from "@/server/workspace";

export async function GET(req: Request, ctx: RouteContext<"/api/days/[date]">) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  return ok(await getDayView(s.companyId, date));
}
