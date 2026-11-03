import { requireAdmin } from "@/server/auth";
import { isIsoDate } from "@/server/domain/dates";
import { badRequest, ok, readJson } from "@/server/http";
import { originalPath } from "@/server/originals";
import { materialsFolder } from "@/server/shared-days";
import { signedUploadUrl } from "@/server/storage";

export async function POST(req: Request, ctx: RouteContext<"/api/admin/days/[date]/materials/upload-url">) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  const body = await readJson(req);
  const path = originalPath(materialsFolder(date), body?.filename, body?.size);
  if (typeof path !== "string") return badRequest(path.error);
  return ok({ storagePath: path, uploadUrl: await signedUploadUrl(path) });
}
