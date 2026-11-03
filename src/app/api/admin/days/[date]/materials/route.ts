import { requireAdmin } from "@/server/auth";
import { isIsoDate } from "@/server/domain/dates";
import { badRequest, ok, readJson, str } from "@/server/http";
import { MAX_MATERIAL_CHARS, addSharedMaterial } from "@/server/shared-days";

// 일정 PDF·교육자료는 브라우저에서 추출한 텍스트만 받는다(FUNC-5)
export async function POST(req: Request, ctx: RouteContext<"/api/admin/days/[date]/materials">) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  const body = await readJson(req);
  const kind = body?.kind;
  const filename = str(body?.filename)?.trim().slice(0, 200);
  const text = str(body?.text);
  if (kind !== "schedule" && kind !== "education") return badRequest("종류는 일정 또는 교육자료여야 합니다");
  if (!filename) return badRequest("파일 이름이 없습니다");
  if (!text?.trim()) return badRequest("읽은 글자가 없습니다");
  if (text.length > MAX_MATERIAL_CHARS) return badRequest(`자료 하나는 ${MAX_MATERIAL_CHARS.toLocaleString()}자 이내여야 합니다`);
  return ok({ id: await addSharedMaterial(date, kind, filename, text) }, 201);
}
