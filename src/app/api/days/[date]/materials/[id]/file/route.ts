import { requireCompany } from "@/server/auth";
import { isIsoDate } from "@/server/domain/dates";
import { isUuid, notFound, ok } from "@/server/http";
import { materialOriginal } from "@/server/shared-days";
import { signedDownloadUrl } from "@/server/storage";

// 교육자료 원본은 운영사 공통 자료라 로그인한 모든 회사가 내려받는다(2026-11-03 사용자 답변)
export async function GET(req: Request, ctx: RouteContext<"/api/days/[date]/materials/[id]/file">) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const { date, id } = await ctx.params;
  if (!isIsoDate(date) || !isUuid(id)) return notFound();
  const o = await materialOriginal(date, id);
  return o ? ok({ url: await signedDownloadUrl(o.path, o.filename) }) : notFound();
}
