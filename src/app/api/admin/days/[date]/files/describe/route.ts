import { requireAdmin } from "@/server/auth";
import { isIsoDate } from "@/server/domain/dates";
import { badRequest, ok } from "@/server/http";
import { describePendingPhotos } from "@/server/photo-describe";

// 한 요청에 6장씩 동시에 설명한다. 사진이 많으면 관리자 화면이 remaining이 0이 되거나 더 설명되지 않을 때까지 다시 부른다(PHOTO-1).
const BATCH = 6;
export const maxDuration = 120;

export async function POST(req: Request, ctx: RouteContext<"/api/admin/days/[date]/files/describe">) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  return ok(await describePendingPhotos(date, BATCH));
}
