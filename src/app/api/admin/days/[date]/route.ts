import { requireAdmin } from "@/server/auth";
import { isIsoDate } from "@/server/domain/dates";
import { badRequest, ok, readJson } from "@/server/http";
import { MAX_SCHEDULE_CHARS, getSharedDay, setSharedSchedule } from "@/server/shared-days";

export async function GET(req: Request, ctx: RouteContext<"/api/admin/days/[date]">) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  return ok((await getSharedDay(date)) ?? { date, scheduleText: "", files: [], materials: [] });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/admin/days/[date]">) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  const text = (await readJson(req))?.scheduleText;
  if (typeof text !== "string" || text.length > MAX_SCHEDULE_CHARS) return badRequest(`일정은 ${MAX_SCHEDULE_CHARS.toLocaleString()}자 이내로 입력해 주세요`);
  await setSharedSchedule(date, text);
  return ok({ ok: true });
}
