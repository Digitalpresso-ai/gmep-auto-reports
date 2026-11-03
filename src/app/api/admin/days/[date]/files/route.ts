import { requireAdmin } from "@/server/auth";
import { afterResponse } from "@/server/background";
import { isIsoDate } from "@/server/domain/dates";
import { badRequest, ok } from "@/server/http";
import { describePhoto } from "@/server/photo-describe";
import { storeUploadedImage } from "@/server/photos";
import { addSharedFile } from "@/server/shared-days";

// 공통 사진은 응답 뒤 같은 함수 안에서 바로 AI 설명을 만들어 저장한다(PHOTO-1). 화면을 닫아도 진행된다.
export const maxDuration = 60;

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
  const id = await addSharedFile(date, kind, img);
  if (kind === "photo") afterResponse(() => describePhoto(id));
  return ok({ id }, 201);
}
