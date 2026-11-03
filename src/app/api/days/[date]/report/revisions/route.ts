import { requireCompany } from "@/server/auth";
import { isIsoDate } from "@/server/domain/dates";
import { REVISION_REQUEST_LIMIT } from "@/server/domain/prompt";
import { listRevisions, reviseReport } from "@/server/generate";
import { badRequest, fail, ok, readJson } from "@/server/http";

// 수정도 보고서 전체를 다시 출력하므로 생성과 같은 시간이 걸린다(AI-7)
export const maxDuration = 300;

export async function GET(req: Request, ctx: RouteContext<"/api/days/[date]/report/revisions">) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  return ok({ revisions: await listRevisions(s.companyId, date) });
}

export async function POST(req: Request, ctx: RouteContext<"/api/days/[date]/report/revisions">) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  const raw = (await readJson(req))?.request;
  const request = typeof raw === "string" ? raw.trim() : "";
  if (!request || request.length > REVISION_REQUEST_LIMIT) return badRequest(`수정 요청은 1~${REVISION_REQUEST_LIMIT.toLocaleString()}자로 적어 주세요`);
  const r = await reviseReport(s.companyId, date, request);
  switch (r.kind) {
    case "ok":
      return ok({ report: r.report, usage: r.usage, revisions: r.revisions });
    case "no_report":
      return fail(404, "no_report", "이 날짜 보고서가 없습니다. 먼저 보고서를 만들어 주세요");
    case "in_progress":
      return fail(409, "in_progress", "AI가 보고서를 작성하는 중입니다. 끝난 뒤 다시 시도해 주세요");
    case "limit_reached":
      return fail(429, "limit_reached", "오늘 수정 요청 한도를 다 쓰셨습니다. 직접 편집과 Word 다운로드는 계속 쓸 수 있습니다");
    case "ai_parse_failed":
      return fail(502, "ai_parse_failed", "수정한 보고서 형식을 만들지 못했습니다. 다시 시도해 주세요(횟수는 차감되지 않았습니다)");
    case "ai_failed":
      return fail(502, "ai_failed", "AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요(횟수는 차감되지 않았습니다)");
  }
}
