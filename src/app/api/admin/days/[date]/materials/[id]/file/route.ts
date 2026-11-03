import { requireAdmin } from "@/server/auth";
import { isIsoDate } from "@/server/domain/dates";
import { isUuid, notFound, ok } from "@/server/http";
import { materialOriginal } from "@/server/shared-days";
import { signedDownloadUrl } from "@/server/storage";

export async function GET(req: Request, ctx: RouteContext<"/api/admin/days/[date]/materials/[id]/file">) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  const { date, id } = await ctx.params;
  if (!isIsoDate(date) || !isUuid(id)) return notFound();
  const o = await materialOriginal(date, id);
  return o ? ok({ url: await signedDownloadUrl(o.path, o.filename) }) : notFound();
}
