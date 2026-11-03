import { requireAdmin } from "@/server/auth";
import { isIsoDate } from "@/server/domain/dates";
import { isUuid, notFound, ok } from "@/server/http";
import { deleteSharedMaterial } from "@/server/shared-days";

export async function DELETE(req: Request, ctx: RouteContext<"/api/admin/days/[date]/materials/[id]">) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  const { date, id } = await ctx.params;
  if (!isIsoDate(date) || !isUuid(id)) return notFound();
  return (await deleteSharedMaterial(date, id)) ? ok({ ok: true }) : notFound();
}
