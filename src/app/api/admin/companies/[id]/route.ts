import { requireAdmin } from "@/server/auth";
import { renameCompany } from "@/server/companies";
import { badRequest, fail, isUuid, notFound, ok, readJson, str } from "@/server/http";

export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/companies/[id]">) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const name = str((await readJson(req))?.name)?.trim();
  if (!name || name.length > 100) return badRequest("회사명을 100자 이내로 입력해 주세요");
  const r = await renameCompany(id, name);
  if (r === "not_found") return notFound();
  if (r === "duplicate") return fail(409, "duplicate", "같은 이름의 회사가 이미 있습니다");
  return ok({ ok: true });
}
