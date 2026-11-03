import { requireAdmin } from "@/server/auth";
import { isIsoDate } from "@/server/domain/dates";
import { isUuid, notFound, ok } from "@/server/http";
import { deleteSharedFile } from "@/server/shared-days";

export async function DELETE(req: Request, ctx: RouteContext<"/api/admin/days/[date]/files/[id]">) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  const { date, id } = await ctx.params;
  if (!isIsoDate(date) || !isUuid(id)) return notFound();
  return (await deleteSharedFile(date, id)) ? ok({ ok: true }) : notFound();
}
