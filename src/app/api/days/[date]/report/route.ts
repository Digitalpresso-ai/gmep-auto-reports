import { requireCompany } from "@/server/auth";
import { db } from "@/server/db";
import { isIsoDate } from "@/server/domain/dates";
import { afterResponse } from "@/server/background";
import { saveEditedReport, startGeneration, type GenerateEvent, type GenerateResult } from "@/server/generate";
import { badRequest, fail, notFound, ok, readJson } from "@/server/http";

// 생성은 1~3분 걸린다(AI-7). Vercel Hobby 함수 한도가 300초다.
export const maxDuration = 300;

const MAX_HTML = 300_000;

const FAILURES = {
  report_exists: [409, "이 날짜 보고서가 이미 있습니다. 다시 만들면 직접 고친 내용이 사라집니다"],
  in_progress: [409, "보고서를 만드는 중입니다. 끝난 뒤 다시 시도해 주세요"],
  limit_reached: [429, "오늘 사용 한도를 다 쓰셨습니다. 직접 편집과 Word 다운로드는 계속 쓸 수 있습니다"],
  ai_parse_failed: [502, "보고서 형식을 만들지 못했습니다. 다시 시도해 주세요(횟수는 차감되지 않았습니다)"],
  ai_failed: [502, "AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요(횟수는 차감되지 않았습니다)"],
} as const;
type FailureCode = keyof typeof FAILURES;

const failure = (code: FailureCode) => fail(FAILURES[code][0], code, FAILURES[code][1]);
const errorLine = (code: FailureCode) => ({ type: "error", code, message: FAILURES[code][1] });

/**
 * 생성 결과를 NDJSON으로 보낸다: start → partial* (재시도 때 reset) → done 또는 error.
 * 생성 작업은 스트림과 따로 시작하고 after에 등록해, 브라우저가 끊어도 저장·사용량 기록·진행 기록 해제까지 끝낸다.
 */
function streamGeneration(run: (onEvent: (e: GenerateEvent) => void) => Promise<GenerateResult>): Response {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let open = true;
  // 끊긴 뒤의 enqueue·close는 예외를 내므로 무시한다
  const send = (line: object) => {
    if (!open) return;
    try {
      controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
    } catch {
      open = false;
    }
  };
  const close = () => {
    if (!open) return;
    open = false;
    try {
      controller.close();
    } catch {}
  };
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      // Safari/WebKit은 1024바이트를 받기 전까지 스트림 응답을 그리지 않는다(Next.js streaming 안내 "Clients"). 첫 줄을 그 이상으로 채운다.
      send({ type: "start", pad: " ".repeat(1024) });
    },
    cancel() {
      open = false;
    },
  });
  const job = run(send)
    .then(
      (r) => send(r.kind === "ok" ? { type: "done", report: r.report, usage: r.usage } : errorLine(r.kind)),
      (e) => {
        console.error("보고서 생성 실패", { error: e instanceof Error ? e.message : String(e) });
        send(errorLine("ai_failed"));
      },
    )
    .finally(close);
  afterResponse(() => job);
  return new Response(body, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
  });
}

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
  // 검사 실패는 Accept와 관계없이 스트림을 열기 전에 JSON 오류로 답한다
  const start = await startGeneration(s.companyId, date, overwrite);
  if (start.kind !== "ready") return failure(start.kind);
  if (req.headers.get("accept")?.includes("application/x-ndjson")) return streamGeneration(start.run);
  const r = await start.run();
  return r.kind === "ok" ? ok({ report: r.report, usage: r.usage }) : failure(r.kind);
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
