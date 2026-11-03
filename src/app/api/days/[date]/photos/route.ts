import { requireCompany } from "@/server/auth";
import { isIsoDate } from "@/server/domain/dates";
import { badRequest, ok } from "@/server/http";
import { storeUploadedImage } from "@/server/photos";
import { addCompanyPhoto } from "@/server/workspace";

// 회사 사진은 회사별 폴더에 둔다(DATA-2)
export async function POST(req: Request, ctx: RouteContext<"/api/days/[date]/photos">) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  const form = await req.formData().catch(() => null);
  if (!form) return badRequest("사진 파일이 없습니다");
  const img = await storeUploadedImage(form, `companies/${s.companyId}/${date}`);
  if (typeof img === "string") return badRequest(img);
  return ok({ id: await addCompanyPhoto(s.companyId, date, img) }, 201);
}
