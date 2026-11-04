import { requireCompany } from "@/server/auth";
import { db } from "@/server/db";
import { isIsoDate } from "@/server/domain/dates";
import { generateReport, saveEditedReport } from "@/server/generate";
import { badRequest, fail, notFound, ok, readJson } from "@/server/http";

// 생성은 1~3분 걸린다(AI-7). Vercel Hobby 함수 한도가 300초다.
export const maxDuration = 300;

const MAX_HTML = 300_000;

export async function GET(req: Request, ctx: RouteContext<"/api/days/[date]/report">) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  const [r] = await db()<{ title: string; body_html: string; updated_at: Date }[]>`
    select title, body_html, updated_at from reports where company_id = ${s.companyId} and report_date = ${date}`;
  return r ? ok({ title: r.title, bodyHtml: r.body_html, updatedAt: r.updated_at.toISOString() }) : notFound();
}

export async function POST(req: Request, ctx: RouteContext<"/api/days/[date]/report">) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  const overwrite = (await readJson(req))?.overwrite === true;
  const r = await generateReport(s.companyId, date, overwrite);
  switch (r.kind) {
    case "ok":
      return ok({ report: r.report, usage: r.usage });
    case "report_exists":
      return fail(409, "report_exists", "이 날짜 보고서가 이미 있습니다. 다시 만들면 직접 고친 내용이 사라집니다");
    case "in_progress":
      return fail(409, "in_progress", "보고서를 만드는 중입니다. 끝난 뒤 다시 시도해 주세요");
    case "limit_reached":
      return fail(429, "limit_reached", "오늘 사용 한도를 다 쓰셨습니다. 직접 편집과 Word 다운로드는 계속 쓸 수 있습니다");
    case "ai_parse_failed":
      return fail(502, "ai_parse_failed", "보고서 형식을 만들지 못했습니다. 다시 시도해 주세요(횟수는 차감되지 않았습니다)");
    case "ai_failed":
      return fail(502, "ai_failed", "AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요(횟수는 차감되지 않았습니다)");
  }
}

export async function PUT(req: Request, ctx: RouteContext<"/api/days/[date]/report">) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  const html = (await readJson(req))?.bodyHtml;
  if (typeof html !== "string" || html.length > MAX_HTML) return badRequest("보고서 내용이 잘못되었습니다");
  const r = await saveEditedReport(s.companyId, date, html);
  switch (r.kind) {
    case "ok":
      return ok({ updatedAt: r.updatedAt });
    case "in_progress":
      return fail(409, "in_progress", "AI가 보고서를 작성하는 중입니다. 끝난 뒤 다시 저장해 주세요");
    case "no_report":
      return notFound();
  }
}
