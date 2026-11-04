import { requireAdmin } from "@/server/auth";
import { isIsoDate } from "@/server/domain/dates";
import { badRequest, ok } from "@/server/http";
import { storeUploadedImage } from "@/server/photos";
import { addSharedFile } from "@/server/shared-days";

export async function POST(req: Request, ctx: RouteContext<"/api/admin/days/[date]/files">) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  const form = await req.formData().catch(() => null);
  const kind = form?.get("kind");
  if (!form || (kind !== "photo" && kind !== "schedule_image")) return badRequest("종류는 사진 또는 일정 이미지여야 합니다");
  const img = await storeUploadedImage(form, `shared/${date}`);
  if (typeof img === "string") return badRequest(img);
  return ok({ id: await addSharedFile(date, kind, img) }, 201);
}
