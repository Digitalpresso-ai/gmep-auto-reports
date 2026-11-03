import { requireCompany } from "@/server/auth";
import { isIsoDate } from "@/server/domain/dates";
import { isUuid, notFound, ok } from "@/server/http";
import { removeObjects } from "@/server/storage";
import { deleteCompanyPhoto } from "@/server/workspace";

export async function DELETE(req: Request, ctx: RouteContext<"/api/days/[date]/photos/[id]">) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const { date, id } = await ctx.params;
  if (!isIsoDate(date) || !isUuid(id)) return notFound();
  const path = await deleteCompanyPhoto(s.companyId, date, id);
  if (!path) return notFound();
  await removeObjects([path]);
  return ok({ ok: true });
}
