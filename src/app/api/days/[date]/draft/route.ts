import { requireCompany } from "@/server/auth";
import { isIsoDate } from "@/server/domain/dates";
import { badRequest, isUuid, ok, readJson } from "@/server/http";
import { MAX_SCHEDULE_CHARS } from "@/server/shared-days";
import { MAX_NOTES_CHARS, resolvePhotos, saveDraft, type DraftPatch, type PhotoRef } from "@/server/workspace";

function parseRefs(v: unknown): PhotoRef[] | null {
  if (!Array.isArray(v)) return null;
  const refs: PhotoRef[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    const source = x?.source;
    if ((source !== "shared" && source !== "company") || !isUuid(x?.id) || seen.has(x.id)) return null;
    seen.add(x.id);
    refs.push({ source, id: x.id });
  }
  return refs;
}

// 일정은 회사가 직접 고쳤을 때만 보낸다. 보내지 않으면 공통 일정을 계속 따른다(SHARED-2).
export async function PUT(req: Request, ctx: RouteContext<"/api/days/[date]/draft">) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  const body = await readJson(req);
  if (!body) return badRequest("입력 형식이 잘못되었습니다");
  const patch: DraftPatch = {};
  if (body.scheduleText !== undefined) {
    if (typeof body.scheduleText !== "string" || body.scheduleText.length > MAX_SCHEDULE_CHARS) return badRequest("일정이 너무 깁니다");
    patch.scheduleText = body.scheduleText;
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== "string" || body.notes.length > MAX_NOTES_CHARS) return badRequest("특이사항은 5,000자 이내로 입력해 주세요");
    patch.notes = body.notes;
  }
  if (body.selectedPhotos !== undefined) {
    const refs = parseRefs(body.selectedPhotos);
    if (!refs || !(await resolvePhotos(s.companyId, date, refs))) return badRequest("고를 수 없는 사진이 있습니다");
    patch.selectedPhotos = refs;
  }
  await saveDraft(s.companyId, date, patch);
  return ok({ ok: true });
}
