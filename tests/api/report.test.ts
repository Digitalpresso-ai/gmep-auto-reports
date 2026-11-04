import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelRequest, ModelResult, StreamRequest, StreamResult, StreamUsage, ToolUseEvent } from "@/server/ai";
import { buildAgentPrompt } from "@/server/domain/agent";
import { parseBlocks, renderDoc } from "@/server/domain/blocks";
import { GMEP_DAILY } from "@/server/domain/template";
import { objects } from "./fake-storage";
import { companyWithPassword, loginCookie, params, request, startDb, type TestDb } from "./harness";

// 일정 이미지를 받는 동안 시간이 흐른 것처럼 만들 수 있게 getObject 앞에 훅을 둔다
const storageHook = vi.hoisted(() => ({ beforeGet: null as (() => void) | null }));
vi.mock("@/server/storage", async () => {
  const fake = await import("./fake-storage");
  return { ...fake, getObject: async (path: string) => (storageHook.beforeGet?.(), fake.getObject(path)) };
});
const callModel = vi.fn<(r: ModelRequest) => Promise<ModelResult>>();
type OnToolUse = (t: ToolUseEvent) => void;
const streamModel = vi.fn<(r: StreamRequest, onToolUse?: OnToolUse) => Promise<StreamResult>>();
// ReAct 루프(report-agent.ts)와 블록 도메인은 실제로 돌리고, 모델 한 턴(streamModel)만 가짜로 바꾼다
vi.mock("@/server/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai")>()),
  callModel: (r: ModelRequest) => callModel(r),
  streamModel: (r: StreamRequest, onToolUse?: OnToolUse) => streamModel(r, onToolUse),
}));
// 응답 뒤에도 이어지는 생성 작업(after)은 모아 두었다가 테스트가 기다린다
const background: (() => Promise<void>)[] = [];
vi.mock("@/server/background", () => ({ afterResponse: (fn: () => Promise<void>) => void background.push(fn) }));
const runBackground = async () => {
  while (background.length) await background.shift()!();
};
type RunAgent = typeof import("@/server/report-agent").runReportAgent;
// 루프는 실제로 돌리되, 넘긴 인자를 확인하거나 루프 결과를 직접 주입할 수 있게 감싼다
const agent = vi.hoisted(() => ({ real: null as RunAgent | null }));
const runAgent = vi.fn<RunAgent>();
vi.mock("@/server/report-agent", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/server/report-agent")>();
  agent.real = m.runReportAgent;
  return { ...m, runReportAgent: (o: Parameters<RunAgent>[0]) => runAgent(o) };
});

let t: TestDb;
let a: { id: string; cookie: string };
let b: { id: string; cookie: string };
const date = "2026-11-02";

const goodJson = JSON.stringify({
  title: "GMEP 일일 출장보고서 — Day 1",
  basic: [["일자", "2026. 11. 2.(월)"]],
  schedule: [["09:30", "온보딩", "참석 완료"]],
  achievements: [{ t: "현지 거점 확보", sub: ["코워킹 이용"] }],
});
const reply = (text: string, inputTokens = 1000, outputTokens = 500, cacheReadTokens = 0, cacheWriteTokens = 0): ModelResult => ({
  text, inputTokens, outputTokens, model: "claude-sonnet-5-5", stopReason: "end_turn", cacheReadTokens, cacheWriteTokens,
});

beforeAll(async () => {
  t = await startDb();
  const aId = await companyWithPassword(t.sql, "주식회사 디지털프레소", "a-password");
  const bId = await companyWithPassword(t.sql, "공존", "b-password");
  a = { id: aId, cookie: await loginCookie(aId, "a-password") };
  b = { id: bId, cookie: await loginCookie(bId, "b-password") };
  await t.sql`update companies set traveler = '송지웅', business_intro = '건설 문서 자동화', proposal_text = '기안 본문' where id = ${aId}`;
  await t.sql`insert into shared_days (report_date, schedule_text) values (${date}, '09:30 온보딩')`;
  await t.sql`insert into shared_files (report_date, kind, storage_path, filename, width, height) values
    (${date}, 'schedule_image', 'shared/2026-11-02/s1.jpg', 's1.jpg', 1600, 1200),
    (${date}, 'photo', 'shared/2026-11-02/p1.jpg', 'p1.jpg', 1100, 825)`;
  objects.set("shared/2026-11-02/s1.jpg", { bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" });
  await t.sql`insert into shared_materials (report_date, kind, filename, text_content) values (${date}, 'education', '강의.pdf', '시장 진입 전략')`;
});
afterAll(() => t?.stop());
beforeEach(() => {
  callModel.mockReset();
  streamModel.mockReset();
  runAgent.mockReset();
  runAgent.mockImplementation((o) => agent.real!(o));
});

const generate = async (cookie: string, body: unknown = {}, d = date) =>
  (await import("@/app/api/days/[date]/report/route")).POST(request("POST", "/x", { cookie, body }), params({ date: d }));
const getReport = async (cookie: string, d = date) => (await import("@/app/api/days/[date]/report/route")).GET(request("GET", "/x", { cookie }), params({ date: d }));
const saveReport = async (cookie: string, body: unknown, d = date) =>
  (await import("@/app/api/days/[date]/report/route")).PUT(request("PUT", "/x", { cookie, body }), params({ date: d }));
const usageRows = (companyId: string) => t.sql`select kind, success, input_tokens, output_tokens, model from ai_usage where company_id = ${companyId} order by id`;

describe("FUNC-8·AI-1 보고서 생성", () => {
  it("서버가 회사·일정·교육자료로 프롬프트를 만들고, 일정 이미지만 이미지로 보낸다(AI-6)", async () => {
    await (await import("@/app/api/days/[date]/draft/route")).PUT(
      request("PUT", "/x", { cookie: a.cookie, body: { notes: "CTO 미팅", selectedPhotos: [] } }),
      params({ date }),
    );
    callModel.mockResolvedValueOnce(reply(goodJson));
    const res = await generate(a.cookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.title).toBe("GMEP 일일 출장보고서 — Day 1");
    expect(body.report.bodyHtml).toContain("<h2>3. 주요 성과</h2>");
    expect(body.usage.generateRemaining).toBe(4);
    const req = callModel.mock.calls[0][0];
    expect(req.prompt).toContain("- 회사명: 주식회사 디지털프레소");
    expect(req.prompt).toContain("09:30 온보딩");
    expect(req.prompt).toContain("# 강의.pdf\n시장 진입 전략");
    expect(req.prompt).toContain("CTO 미팅");
    expect(req.prompt).toContain("기안 본문");
    expect(req.images).toEqual([{ mediaType: "image/jpeg", base64: Buffer.from([1, 2, 3]).toString("base64") }]);
    // 같은 자료로 다시 만들거나 AI로 고칠 때 이 프롬프트를 캐시에서 읽는다(AI-13)
    expect(req.cacheTtl).toBe("1h");
    expect(req.followUp).toBeUndefined();
  });

  it("호출마다 사용량을 회사·종류·모델·성공 여부와 함께 기록한다(AI-12)", async () => {
    expect(await usageRows(a.id)).toEqual([{ kind: "generate", success: true, input_tokens: 1000, output_tokens: 500, model: "claude-sonnet-5-5" }]);
  });

  it("캐시에 쓰고 읽은 입력 토큰을 따로 기록한다(AI-13)", async () => {
    const d = "2026-11-03";
    callModel.mockResolvedValueOnce(reply(goodJson, 30_000, 500, 20_000, 9_000));
    expect((await generate(a.cookie, {}, d)).status).toBe(200);
    const [row] = await t.sql`select input_tokens, cache_read_tokens, cache_write_tokens from ai_usage where company_id = ${a.id} order by id desc limit 1`;
    expect(row).toEqual({ input_tokens: 30_000, cache_read_tokens: 20_000, cache_write_tokens: 9_000 });
    await t.sql`delete from reports where company_id = ${a.id} and report_date = ${d}`;
    await t.sql`delete from ai_usage where company_id = ${a.id} and cache_read_tokens > 0`;
  });

  it("저장한 보고서를 다시 불러온다", async () => {
    const body = await (await getReport(a.cookie)).json();
    expect(body.title).toBe("GMEP 일일 출장보고서 — Day 1");
    expect(body.bodyHtml).toContain("현지 거점 확보");
  });
});

describe("FUNC-18 같은 날짜 덮어쓰기", () => {
  it("이미 보고서가 있으면 확인 없이 다시 만들지 않는다", async () => {
    const res = await generate(a.cookie);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("report_exists");
    expect(callModel).not.toHaveBeenCalled();
  });

  it("덮어쓰기를 확인하면 새 내용으로 바꾸고 1회 차감한다", async () => {
    callModel.mockResolvedValueOnce(reply(JSON.stringify({ title: "다시 만든 보고서" })));
    const res = await generate(a.cookie, { overwrite: true });
    expect(res.status).toBe(200);
    expect((await res.json()).usage.generateRemaining).toBe(3);
    expect((await (await getReport(a.cookie)).json()).title).toBe("다시 만든 보고서");
  });
});

describe("AI-5 응답 해석 실패", () => {
  it("JSON이 아니면 1회 다시 부르고 그래도 실패하면 오류를 낸다. 실패는 횟수에서 빼지 않는다(AI-9)", async () => {
    callModel.mockResolvedValueOnce(reply("설명만 있음")).mockResolvedValueOnce(reply("또 설명"));
    const res = await generate(a.cookie, { overwrite: true });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("ai_parse_failed");
    expect(callModel).toHaveBeenCalledTimes(2);
    expect((await (await getReport(a.cookie)).json()).title).toBe("다시 만든 보고서");
    const day = await (await (await import("@/app/api/days/[date]/route")).GET(request("GET", "/x", { cookie: a.cookie }), params({ date }))).json();
    expect(day.usage.generateRemaining).toBe(3);
    const rows = await usageRows(a.id);
    expect(rows.slice(-2).map((r) => r.success)).toEqual([false, false]);
  });

  it("첫 응답만 실패하면 재시도 결과를 쓴다", async () => {
    callModel.mockResolvedValueOnce(reply("```")).mockResolvedValueOnce(reply(goodJson));
    expect((await generate(a.cookie, { overwrite: true })).status).toBe(200);
  });

  it("API 오류도 실패로 기록하고 차감하지 않는다", async () => {
    callModel.mockRejectedValueOnce(new Error("overloaded"));
    const res = await generate(a.cookie, { overwrite: true });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("ai_failed");
    const [last] = (await usageRows(a.id)).slice(-1);
    expect(last).toMatchObject({ success: false, input_tokens: 0, output_tokens: 0 });
  });

  it("스트림이 도중에 끊겨도 그때까지 받은 토큰을 실패로 기록한다", async () => {
    const { ModelStreamError } = await import("@/server/ai");
    callModel.mockRejectedValueOnce(new ModelStreamError({ input: 12_000, output: 300, cacheRead: 8_000, cacheWrite: 0 }, "claude-sonnet-5-5", new Error("socket hang up")));
    const res = await generate(a.cookie, { overwrite: true });
    expect(res.status).toBe(502);
    const [last] = (await usageRows(a.id)).slice(-1);
    expect(last).toMatchObject({ success: false, input_tokens: 12_000, output_tokens: 300 });
  });
});

describe("AI-9·AI-10 한도", () => {
  it("하루 생성 한도를 다 쓰면 AI를 부르지 않고 429를 준다", async () => {
    await t.sql`update companies set daily_generate_limit = 0 where id = ${b.id}`;
    const res = await generate(b.cookie);
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("limit_reached");
    expect(callModel).not.toHaveBeenCalled();
    await t.sql`update companies set daily_generate_limit = 5 where id = ${b.id}`;
  });

  it("월 토큰 한도에 닿으면 막는다", async () => {
    await t.sql`update companies set monthly_token_limit = 100 where id = ${b.id}`;
    await t.sql`insert into ai_usage (company_id, kind, model, input_tokens, output_tokens, success) values (${b.id}, 'generate', 'm', 80, 30, false)`;
    expect((await generate(b.cookie)).status).toBe(429);
    await t.sql`update companies set monthly_token_limit = null where id = ${b.id}`;
  });

  it("같은 회사가 생성 중이면 두 번째 요청을 거부한다", async () => {
    await t.sql`insert into ai_inflight (company_id) values (${b.id})`;
    const res = await generate(b.cookie);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("in_progress");
    await t.sql`update ai_inflight set started_at = now() - interval '10 minutes' where company_id = ${b.id}`;
    callModel.mockResolvedValueOnce(reply(goodJson));
    expect((await generate(b.cookie)).status).toBe(200);
    expect((await t.sql`select 1 from ai_inflight where company_id = ${b.id}`).length).toBe(0);
  });
});

describe("FUNC-9 미리보기 직접 수정", () => {
  it("고친 HTML을 저장하되 스크립트·이벤트 속성은 지운다", async () => {
    const res = await saveReport(a.cookie, { bodyHtml: '<h1>고친 제목</h1><p onclick="x()">문장<script>alert(1)</script></p><div class="photos"></div>' });
    expect(res.status).toBe(200);
    const body = await (await getReport(a.cookie)).json();
    expect(body.title).toBe("고친 제목");
    expect(body.bodyHtml).toBe('<h1>고친 제목</h1><p>문장</p><div class="photos"></div>');
  });

  it("AI가 생성·수정 중이면 직접 편집 저장을 거부하고, 오래된 진행 기록은 무시한다", async () => {
    const kept = (await (await getReport(a.cookie)).json()).bodyHtml;
    await t.sql`insert into ai_inflight (company_id) values (${a.id})`;
    try {
      const res = await saveReport(a.cookie, { bodyHtml: "<h1>생성 중 편집</h1>" });
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe("in_progress");
      expect((await (await getReport(a.cookie)).json()).bodyHtml).toBe(kept);
      await t.sql`update ai_inflight set started_at = now() - interval '10 minutes' where company_id = ${a.id}`;
      expect((await saveReport(a.cookie, { bodyHtml: kept })).status).toBe(200);
    } finally {
      await t.sql`delete from ai_inflight where company_id = ${a.id}`;
    }
  });

  it("보고서가 없는 날짜는 저장할 수 없다", async () => {
    expect((await saveReport(a.cookie, { bodyHtml: "<h1>x</h1>" }, "2026-11-20")).status).toBe(404);
  });
});

describe("AUTH-8 다른 회사 보고서", () => {
  it("B사는 A사 보고서를 읽거나 고칠 수 없다", async () => {
    await t.sql`delete from reports where company_id = ${b.id}`;
    expect((await getReport(b.cookie)).status).toBe(404);
    expect((await saveReport(b.cookie, { bodyHtml: "<h1>침입</h1>" })).status).toBe(404);
    expect((await (await getReport(a.cookie)).json()).title).toBe("고친 제목");
  });
});

describe("PHOTO-2 사진은 AI에 보내지 않음", () => {
  it("고른 사진의 번호·설명을 프롬프트에 넣지 않고, 본문 섹션에 사진 자리 없이 참여 사진 자리 하나만 둔다", async () => {
    const d = "2026-11-05";
    const cId = await companyWithPassword(t.sql, "주식회사 긱토", "c-password");
    const c = { cookie: await loginCookie(cId, "c-password") };
    await t.sql`insert into shared_days (report_date) values (${d})`;
    const [p1] = await t.sql<{ id: string }[]>`insert into shared_files (report_date, kind, storage_path, filename, width, height, description)
      values (${d}, 'photo', 'shared/2026-11-05/p1.jpg', 'p1.jpg', 1100, 825, '[강연] 발표 장면') returning id`;
    const selectedPhotos = [{ source: "shared", id: p1.id }];
    await (await import("@/app/api/days/[date]/draft/route")).PUT(request("PUT", "/x", { cookie: c.cookie, body: { selectedPhotos } }), params({ date: d }));
    callModel.mockResolvedValueOnce(
      reply(JSON.stringify({ title: "t", education: [{ title: "3-1. 강연", items: [{ t: "시장", sub: [] }], table: null }], photos: [{ no: 1, place: "edu:1" }] })),
    );
    const body = await (await generate(c.cookie, {}, d)).json();
    const req = callModel.mock.calls[0][0];
    expect(req.prompt).not.toContain("[사진 1]");
    expect(req.prompt).not.toContain("발표 장면");
    expect(req.images).toHaveLength(0);
    expect(body.report.bodyHtml).not.toContain("data-photos");
    expect(body.report.bodyHtml.match(/class="photos"/g)).toHaveLength(1);
  });
});

describe("FUNC-10 AI 수정", () => {
  const d = "2026-11-06";
  let c: { id: string; cookie: string };
  let p1: string;
  let p2: string;
  const revisions = async (cookie: string, dd = d) =>
    (await import("@/app/api/days/[date]/report/revisions/route")).GET(request("GET", "/x", { cookie }), params({ date: dd }));
  const revise = async (cookie: string, body: unknown, dd = d) =>
    (await import("@/app/api/days/[date]/report/revisions/route")).POST(request("POST", "/x", { cookie, body }), params({ date: dd }));
  const storedBody = async () => (await t.sql<{ body_html: string }[]>`select body_html from reports where company_id = ${c.id} and report_date = ${d}`)[0].body_html;
  const reviseUsed = async () => (await (await (await import("@/app/api/days/[date]/route")).GET(request("GET", "/x", { cookie: c.cookie }), params({ date: d }))).json()).usage;

  type FakeCall = { name: string; input: unknown };
  let toolSeq = 0;
  /** 모델 한 턴: tool 호출마다 onToolUse를 부르고(content_block_stop) 턴 결과를 돌려준다. */
  const turn =
    (calls: FakeCall[], o: { usage?: Partial<StreamUsage>; stop?: string; model?: string } = {}) =>
    async (_r: StreamRequest, onToolUse?: OnToolUse): Promise<StreamResult> => {
      const content = calls.map((x) => ({ type: "tool_use" as const, id: `toolu_${++toolSeq}`, name: x.name, input: x.input }));
      for (const b of content) onToolUse?.({ id: b.id, name: b.name, input: b.input });
      return {
        content,
        stopReason: o.stop ?? (calls.length ? "tool_use" : "end_turn"),
        model: o.model ?? "claude-sonnet-5-5",
        usage: { input: 30_000, output: 300, cacheRead: 28_000, cacheWrite: 0, ...o.usage },
        latencyMs: 10,
        firstToolMs: calls.length ? 5 : null,
      };
    };
  const plan = (id: string) => ({ name: "plan_outline", input: { sections: [{ heading: id, intent: "요청 반영" }] } });
  const finish = { name: "finish", input: { note: "" } };
  const insightsList = (text: string) => ({ items: [{ text, sub: ["근거: 강연 사례", "적용: 제품 문서 현지화"] }] });
  /** 저장된 보고서에서 needle을 담은 블록의 id. */
  const blockOf = (html: string, needle: string) => parseBlocks(html).blocks.find((x) => x.html.includes(needle))!.id;

  const firstReport = JSON.stringify({
    title: "처음",
    schedule: [["09:30", "온보딩", "참석"]],
    achievements: [{ t: "현지 거점 확보", sub: ["코워킹 이용"] }],
    insights: [{ t: "현지 수요 확인", sub: ["근거: 강연"] }],
    plans: ["11. 7.(토) 후속 미팅 준비"],
  });
  // 회사가 직접 고친 뒤 첫 수정 직전의 본문과, 그 수정이 바꿀 시사점 목록 블록
  let before = "";
  let target = "";

  beforeAll(async () => {
    const id = await companyWithPassword(t.sql, "주식회사 수정테스트", "r-password");
    c = { id, cookie: await loginCookie(id, "r-password") };
    await t.sql`insert into shared_days (report_date, schedule_text) values (${d}, '09:30 온보딩')`;
    [{ id: p1 }, { id: p2 }] = await t.sql<{ id: string }[]>`insert into shared_files (report_date, kind, storage_path, filename, width, height, description) values
      (${d}, 'photo', 'shared/2026-11-06/p1.jpg', 'p1.jpg', 1100, 825, '[투어] 거점'),
      (${d}, 'photo', 'shared/2026-11-06/p2.jpg', 'p2.jpg', 1100, 825, '[강연] 발표') returning id`;
    const selectedPhotos = [{ source: "shared", id: p1 }, { source: "shared", id: p2 }];
    await (await import("@/app/api/days/[date]/draft/route")).PUT(request("PUT", "/x", { cookie: c.cookie, body: { selectedPhotos } }), params({ date: d }));
  });
  // 수정 경로가 JSON 호출로 돌아가면 바로 드러나게 한다. 생성은 mockResolvedValueOnce로 따로 준다.
  beforeEach(() => {
    callModel.mockRejectedValue(new Error("AI 수정은 JSON 호출을 쓰지 않는다"));
    streamModel.mockRejectedValue(new Error("예상하지 않은 모델 턴"));
  });

  it("보고서가 없으면 수정할 수 없다", async () => {
    const res = await revise(c.cookie, { request: "시사점을 더 구체적으로" });
    expect(res.status).toBe(404);
    expect(callModel).not.toHaveBeenCalled();
    expect(streamModel).not.toHaveBeenCalled();
  });

  it("블록 패치 프롬프트로 고친다: 첫 user 블록은 buildAgentPrompt 결과이고, followUp에 [b번호] 블록 목록과 요청이 들어간다", async () => {
    callModel.mockResolvedValueOnce(reply(firstReport));
    expect((await generate(c.cookie, {}, d)).status).toBe(200);
    const genReq = callModel.mock.calls[0][0];
    const generated = await storedBody();
    await saveReport(c.cookie, { bodyHtml: generated.replace("<h1>처음</h1>", "<h1>직접 고친 제목</h1>").replace("<li>코워킹 이용</li>", "<li>회사가 직접 쓴 메모 &amp; 연락처</li>") }, d);
    before = await storedBody();
    expect(before).toContain("회사가 직접 쓴 메모 &amp; 연락처");
    target = blockOf(before, "현지 수요 확인");

    streamModel.mockImplementationOnce(turn([plan(target), { name: "replace_list", input: { id: target, ...insightsList("현지 조달 규정 확인") } }, finish]));
    const res = await revise(c.cookie, { request: "  시사점을 더 구체적으로  " });
    expect(res.status).toBe(200);
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(streamModel).toHaveBeenCalledTimes(1);
    const req = streamModel.mock.calls[0][0];
    // 캐시 prefix: 생성 입력과 양식만으로 만들고 수정 요청·현재 문서는 넣지 않는다
    const expectedPrompt = buildAgentPrompt(
      {
        companyName: "주식회사 수정테스트",
        traveler: "",
        businessIntro: "",
        date: d,
        proposalText: "",
        scheduleText: "09:30 온보딩",
        scheduleMaterials: [],
        educationMaterials: [],
        notes: "",
        hasScheduleImages: false,
      },
      GMEP_DAILY,
    );
    expect(req.prompt).toBe(expectedPrompt);
    expect(req.images).toEqual(genReq.images);
    expect(req.turns).toEqual([]);
    expect(req.followUp).toContain("[AI 수정]");
    expect(req.followUp).toContain("[b1] <h1>직접 고친 제목</h1>");
    expect(req.followUp).toContain(`[${target}] <ul><li><strong>현지 수요 확인</strong>`);
    // 사진 자리는 사진 키 없이 표시만 한다
    expect(req.followUp).toContain("<p>(참여 사진 자리)</p>");
    expect(req.followUp).not.toContain("shared:");
    expect(req.followUp).toContain("[지난 수정 요청 — 오래된 순, 모두 현재 문서에 반영됨]\n(없음)");
    expect(req.followUp).toContain("[이번 수정 요청]\n시사점을 더 구체적으로");

    const body = await res.json();
    expect(body.report.title).toBe("직접 고친 제목");
    expect(body.report.bodyHtml).toContain("<strong>현지 조달 규정 확인</strong>");
    expect(body.report.bodyHtml).not.toContain("현지 수요 확인");
    expect(body.revisions.map((r: { request: string }) => r.request)).toEqual(["시사점을 더 구체적으로"]);
    expect(body.usage).toMatchObject({ reviseUsed: 1, reviseLimit: 15, reviseRemaining: 14, generateRemaining: 4 });
    expect((await (await getReport(c.cookie, d)).json()).bodyHtml).toBe(body.report.bodyHtml);
  });

  it("요청이 가리키지 않은 블록(회사가 직접 고친 문장 포함)은 저장된 본문에서 바이트 그대로다", async () => {
    const doc = parseBlocks(before);
    const expected = renderDoc({
      blocks: doc.blocks.map((x) => (x.id === target ? { ...x, html: "<ul><li><strong>현지 조달 규정 확인</strong><ul><li>근거: 강연 사례</li><li>적용: 제품 문서 현지화</li></ul></li></ul>" } : x)),
    });
    expect(expected).not.toBe(before);
    expect(await storedBody()).toBe(expected);
  });

  it("여러 턴이 돌아도 사용량은 수정 1건당 1행(토큰은 턴 합계, 모델은 마지막 턴)이고 하루 수정 횟수는 1만 오른다(AI-9, AI-12)", async () => {
    const rowsBefore = (await usageRows(c.id)).length;
    const usedBefore = (await reviseUsed()).reviseUsed;
    const current = await storedBody();
    const id = blockOf(current, "현지 조달 규정 확인");
    streamModel
      .mockImplementationOnce(turn([plan(id)], { usage: { input: 30_000, output: 100, cacheRead: 28_000, cacheWrite: 2_000 } }))
      .mockImplementationOnce(turn([{ name: "replace_list", input: { id, ...insightsList("조달 규정 확인") } }], { usage: { input: 31_000, output: 200, cacheRead: 30_000 } }))
      .mockImplementationOnce(turn([finish], { usage: { input: 32_000, output: 50, cacheRead: 31_000 }, model: "claude-opus-5-5" }));
    const res = await revise(c.cookie, { request: "아까 바꾼 시사점을 조금 짧게" });
    expect(res.status).toBe(200);
    expect(streamModel).toHaveBeenCalledTimes(3);
    expect((await res.json()).usage.reviseUsed).toBe(usedBefore + 1);
    const rows = await t.sql`select kind, success, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens from ai_usage where company_id = ${c.id} order by id`;
    expect(rows).toHaveLength(rowsBefore + 1);
    expect(rows.at(-1)).toEqual({
      kind: "revise",
      success: true,
      model: "claude-opus-5-5",
      input_tokens: 93_000,
      output_tokens: 350,
      cache_read_tokens: 89_000,
      cache_write_tokens: 2_000,
    });
  });

  it("다음 수정 때 지난 수정 요청을 모두 순서대로 보낸다", async () => {
    const id = blockOf(await storedBody(), "<th>시간</th>");
    const table = { id, style: "grid", head: ["시간", "프로그램", "장소", "수행 내용"], rows: [["09:30", "온보딩", "코워킹", "참석"]] };
    streamModel.mockImplementationOnce(turn([plan(id), { name: "replace_table", input: table }, finish]));
    expect((await revise(c.cookie, { request: "일정 표에 장소 추가" })).status).toBe(200);
    const req = streamModel.mock.calls[0][0];
    expect(req.followUp).toContain("[지난 수정 요청 — 오래된 순, 모두 현재 문서에 반영됨]\n1. 시사점을 더 구체적으로\n2. 아까 바꾼 시사점을 조금 짧게\n");
    expect(req.followUp).toContain("[이번 수정 요청]\n일정 표에 장소 추가");
    const list = await (await revisions(c.cookie)).json();
    expect(list.revisions.map((r: { request: string }) => r.request)).toEqual(["시사점을 더 구체적으로", "아까 바꾼 시사점을 조금 짧게", "일정 표에 장소 추가"]);
  });

  it("스트림이 끊기면 보고서·대화를 바꾸지 않고 횟수도 차감하지 않되, 쓴 토큰은 실패로 기록한다", async () => {
    const { ModelStreamError } = await vi.importActual<typeof import("@/server/ai")>("@/server/ai");
    const kept = await storedBody();
    const id = blockOf(kept, "조달 규정 확인");
    streamModel
      .mockImplementationOnce(turn([plan(id)], { usage: { input: 30_000, output: 100, cacheRead: 28_000 } }))
      .mockImplementationOnce(async (_r, onToolUse) => {
        onToolUse?.({ id: "toolu_x", name: "delete_block", input: { id } });
        throw new ModelStreamError({ input: 31_000, output: 40, cacheRead: 30_000, cacheWrite: 0 }, "claude-sonnet-5-5", new Error("overloaded"));
      });
    const res = await revise(c.cookie, { request: "실패할 요청" });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("ai_failed");
    expect(await storedBody()).toBe(kept);
    expect((await (await revisions(c.cookie)).json()).revisions).toHaveLength(3);
    expect((await reviseUsed()).reviseRemaining).toBe(12);
    const [last] = (await usageRows(c.id)).slice(-1);
    expect(last).toEqual({ kind: "revise", success: false, input_tokens: 61_000, output_tokens: 140, model: "claude-sonnet-5-5" });
  });

  it("응답이 잘리면(max_tokens) 형식 실패로 돌려주고 보고서는 그대로 둔다", async () => {
    const kept = await storedBody();
    const id = blockOf(kept, "조달 규정 확인");
    streamModel.mockImplementationOnce(turn([{ name: "delete_block", input: { id } }], { stop: "max_tokens", usage: { input: 30_000, output: 8_000 } }));
    const res = await revise(c.cookie, { request: "잘릴 요청" });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("ai_parse_failed");
    expect(await storedBody()).toBe(kept);
    expect((await (await revisions(c.cookie)).json()).revisions).toHaveLength(3);
    expect((await reviseUsed()).reviseRemaining).toBe(12);
    const [last] = (await usageRows(c.id)).slice(-1);
    expect(last).toMatchObject({ kind: "revise", success: false, input_tokens: 30_000, output_tokens: 8_000 });
  });

  it("빈 요청이나 너무 긴 요청은 받지 않는다", async () => {
    expect((await revise(c.cookie, { request: "   " })).status).toBe(400);
    expect((await revise(c.cookie, { request: "가".repeat(1001) })).status).toBe(400);
    expect(streamModel).not.toHaveBeenCalled();
  });

  it("하루 수정 한도를 다 쓰면 AI를 부르지 않는다(AI-9)", async () => {
    await t.sql`update companies set daily_revise_limit = 3 where id = ${c.id}`;
    const res = await revise(c.cookie, { request: "한 번 더" });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("limit_reached");
    expect(streamModel).not.toHaveBeenCalled();
    await t.sql`update companies set daily_revise_limit = 15 where id = ${c.id}`;
  });

  it("요청이 가리킨 블록은 회사가 직접 고친 문장이 있어도 AI 결과로 덮어쓴다", async () => {
    const id = blockOf(await storedBody(), "회사가 직접 쓴 메모");
    const list = { id, items: [{ text: "현지 거점 확보", sub: ["코워킹 공간 계약 조건 확인"] }] };
    streamModel.mockImplementationOnce(turn([plan(id), { name: "replace_list", input: list }, finish]));
    expect((await revise(c.cookie, { request: "성과 하위 항목을 다시 써 줘" })).status).toBe(200);
    const stored = await storedBody();
    expect(stored).not.toContain("회사가 직접 쓴 메모");
    expect(stored).toContain("코워킹 공간 계약 조건 확인");
  });

  it("다른 회사는 이 회사의 수정 대화를 보거나 이 날짜 보고서를 고칠 수 없다(AUTH-8)", async () => {
    expect((await (await revisions(b.cookie)).json()).revisions).toEqual([]);
    expect((await revise(b.cookie, { request: "침입" })).status).toBe(404);
    expect(streamModel).not.toHaveBeenCalled();
  });

  it("보고서를 다시 만들면 수정 대화를 지운다", async () => {
    callModel.mockResolvedValueOnce(reply(goodJson));
    expect((await generate(c.cookie, { overwrite: true }, d)).status).toBe(200);
    expect((await (await revisions(c.cookie)).json()).revisions).toEqual([]);
  });

  describe("저장 형식", () => {
    const dd = "2026-11-09";
    let e: { id: string; cookie: string };
    const stored = async () => (await t.sql<{ body_html: string }[]>`select body_html from reports where company_id = ${e.id} and report_date = ${dd}`)[0].body_html;
    const quoted = JSON.stringify({
      title: "처음",
      schedule: [["09:30", '"온보딩"', "참석"]],
      achievements: [{ t: '"현지" 거점 확보', sub: ['코워킹 "A" 이용'] }],
      insights: [{ t: "현지 수요 확인", sub: ["근거: 강연"] }],
      plans: ['"후속" 미팅 준비'],
    });
    /** 블록 하나만 바꾼 기대 문서. */
    const withBlock = (html: string, id: string, block: string) => renderDoc({ blocks: parseBlocks(html).blocks.map((x) => (x.id === id ? { ...x, html: block } : x)) });

    beforeAll(async () => {
      const id = await companyWithPassword(t.sql, "주식회사 저장형식", "q-password");
      e = { id, cookie: await loginCookie(id, "q-password") };
    });

    it("생성 본문의 따옴표(&quot;)가 있어도 첫 수정에서 요청하지 않은 블록은 바이트 그대로다", async () => {
      callModel.mockResolvedValueOnce(reply(quoted));
      expect((await generate(e.cookie, {}, dd)).status).toBe(200);
      const generated = await stored();
      expect(generated).toContain("&quot;현지&quot; 거점 확보");
      const id = blockOf(generated, "현지 수요 확인");
      streamModel.mockImplementationOnce(turn([plan(id), { name: "replace_list", input: { id, ...insightsList("현지 조달 규정 확인") } }, finish]));
      expect((await revise(e.cookie, { request: "시사점을 더 구체적으로" }, dd)).status).toBe(200);
      const expected = withBlock(generated, id, "<ul><li><strong>현지 조달 규정 확인</strong><ul><li>근거: 강연 사례</li><li>적용: 제품 문서 현지화</li></ul></li></ul>");
      expect(await stored()).toBe(expected);
    });

    it("수정 결과의 새 블록에 스크립트·이벤트 속성이 오면 지운다", async () => {
      const current = await stored();
      runAgent.mockImplementationOnce(async () => ({
        ok: true,
        html: current + '<p onclick="x()">새 문단<script>alert(1)</script></p><img src=x onerror="y()">',
        turns: 1,
        usages: [{ input: 10, output: 5, cacheRead: 0, cacheWrite: 0, model: "claude-sonnet-5-5", latencyMs: 1, firstToolMs: null }],
        latencyMs: 1,
        firstBlockMs: null,
        issues: [],
      }));
      expect((await revise(e.cookie, { request: "문단 추가" }, dd)).status).toBe(200);
      expect(await stored()).toBe(current + "<p>새 문단</p>");
    });

    it("저장본의 손대지 않은 블록이라도 위험한 태그·속성이 있으면 지운다", async () => {
      const current = await stored();
      await t.sql`update reports set body_html = ${current + '<p onclick="x()">더러운 문단<script>alert(1)</script></p>'} where company_id = ${e.id} and report_date = ${dd}`;
      const id = blockOf(current, "현지 조달 규정 확인");
      streamModel.mockImplementationOnce(turn([plan(id), { name: "replace_list", input: { id, ...insightsList("조달 규정 확인") } }, finish]));
      expect((await revise(e.cookie, { request: "시사점을 짧게" }, dd)).status).toBe(200);
      const after = await stored();
      expect(after).not.toMatch(/onclick|script/);
      expect(after).toContain("<p>더러운 문단</p>");
      expect(after).toContain("&quot;현지&quot; 거점 확보");
    });

    describe("시간 한도", () => {
      let skew = 0;
      beforeAll(async () => {
        await t.sql`insert into shared_days (report_date) values (${dd}) on conflict do nothing`;
        await t.sql`insert into shared_files (report_date, kind, storage_path, filename, width, height) values (${dd}, 'schedule_image', 'shared/2026-11-09/s1.jpg', 's1.jpg', 1600, 1200)`;
        objects.set("shared/2026-11-09/s1.jpg", { bytes: new Uint8Array([4, 5, 6]), contentType: "image/jpeg" });
      });
      afterAll(async () => {
        await t.sql`delete from shared_files where report_date = ${dd} and kind = 'schedule_image'`;
      });
      beforeEach(() => {
        skew = 0;
        const realNow = Date.now.bind(Date);
        vi.spyOn(Date, "now").mockImplementation(() => realNow() + skew);
      });
      afterEach(() => {
        vi.mocked(Date.now).mockRestore();
        storageHook.beforeGet = null;
      });

      it("일정 이미지를 받는 데 쓴 시간을 루프 시간 한도(240초)에서 뺀다", async () => {
        storageHook.beforeGet = () => void (skew += 100_000);
        const id = blockOf(await stored(), "조달 규정 확인");
        streamModel.mockImplementationOnce(turn([plan(id), { name: "replace_list", input: { id, ...insightsList("조달 규정 확인") } }, finish]));
        expect((await revise(e.cookie, { request: "시사점 유지" }, dd)).status).toBe(200);
        const deadlineMs = runAgent.mock.calls[0][0].limits?.deadlineMs ?? 0;
        expect(deadlineMs).toBeLessThanOrEqual(140_000);
        expect(deadlineMs).toBeGreaterThan(139_000);
      });

      it("남은 시간이 30초보다 적으면 AI를 부르지 않고 실패로 돌려주며 사용량도 쓰지 않는다", async () => {
        storageHook.beforeGet = () => void (skew += 220_000);
        const kept = await stored();
        const rows = (await usageRows(e.id)).length;
        const res = await revise(e.cookie, { request: "시간 부족" }, dd);
        expect(res.status).toBe(502);
        expect((await res.json()).code).toBe("ai_failed");
        expect(runAgent).not.toHaveBeenCalled();
        expect(streamModel).not.toHaveBeenCalled();
        expect(await stored()).toBe(kept);
        expect(await usageRows(e.id)).toHaveLength(rows);
        expect((await t.sql`select 1 from ai_inflight where company_id = ${e.id}`).length).toBe(0);
      });
    });

    // Codex 독립 리뷰(v5)에서 재현: 진행 기록을 잡기 전에 본문을 읽으면, 그 사이 저장된 직접 편집을 AI 결과가 옛 본문으로 덮는다.
    // 진행 기록 insert와 같은 순간에 편집이 들어오는 상황을 트리거로 만든다.
    it("진행 기록을 잡는 순간까지 저장된 직접 편집은 AI 수정 뒤에도 남는다", async () => {
      await t.sql.unsafe(`create function edit_on_reserve() returns trigger language plpgsql as $$
        begin update reports set body_html = body_html || '<p>잠금 직전 편집</p>' where company_id = new.company_id; return new; end $$`);
      await t.sql.unsafe("create trigger edit_on_reserve after insert on ai_inflight for each row execute function edit_on_reserve()");
      try {
        const id = blockOf(await stored(), "조달 규정 확인");
        // 뒤 테스트가 같은 블록을 찾으므로 "조달 규정 확인" 문구를 남긴다
        streamModel.mockImplementationOnce(turn([plan(id), { name: "replace_list", input: { id, ...insightsList("조달 규정 확인 우선") } }, finish]));
        const res = await revise(e.cookie, { request: "경합 확인" }, dd);
        expect(res.status).toBe(200);
        expect(await stored()).toContain("<p>잠금 직전 편집</p>");
      } finally {
        await t.sql.unsafe("drop trigger edit_on_reserve on ai_inflight; drop function edit_on_reserve()");
      }
    });

    // Codex 독립 리뷰(v5)에서 재현: 성공 사용량을 저장 트랜잭션 밖에서 기록하면, 그 기록만 실패할 때 수정은 반영되고 횟수는 안 센다.
    it("성공 사용량을 기록하지 못하면 수정도 저장하지 않고 쓴 토큰은 실패로 기록한다", async () => {
      await t.sql.unsafe(`create function fail_usage() returns trigger language plpgsql as $$
        begin if new.kind = 'revise' and new.success then raise exception 'boom'; end if; return new; end $$`);
      await t.sql.unsafe("create trigger fail_usage before insert on ai_usage for each row execute function fail_usage()");
      try {
        const kept = await stored();
        const id = blockOf(kept, "조달 규정 확인");
        streamModel.mockImplementationOnce(turn([plan(id), { name: "replace_list", input: { id, ...insightsList("규정 확인") } }, finish], { usage: { input: 20_000, output: 200 } }));
        const res = await revise(e.cookie, { request: "기록 실패" }, dd);
        expect(res.status).toBe(502);
        expect(await stored()).toBe(kept);
        expect((await (await revisions(e.cookie, dd)).json()).revisions.map((r: { request: string }) => r.request)).not.toContain("기록 실패");
        expect((await usageRows(e.id)).at(-1)).toEqual({ kind: "revise", success: false, input_tokens: 20_000, output_tokens: 200, model: "claude-sonnet-5-5" });
      } finally {
        await t.sql.unsafe("drop trigger fail_usage on ai_usage; drop function fail_usage()");
      }
    });

    it("저장 트랜잭션이 실패하면 보고서·대화·횟수를 그대로 두고 쓴 토큰은 실패로 기록한다", async () => {
      await t.sql.unsafe(`create function fail_revision() returns trigger language plpgsql as $$
        begin if new.request = '저장 실패' then raise exception 'boom'; end if; return new; end $$`);
      await t.sql.unsafe("create trigger fail_revision before insert on report_revisions for each row execute function fail_revision()");
      try {
        const kept = await stored();
        const count = (await t.sql`select 1 from ai_usage where company_id = ${e.id} and kind = 'revise' and success`).length;
        const id = blockOf(kept, "조달 규정 확인");
        streamModel.mockImplementationOnce(turn([plan(id), { name: "replace_list", input: { id, ...insightsList("규정 확인") } }, finish], { usage: { input: 30_000, output: 300 } }));
        const res = await revise(e.cookie, { request: "저장 실패" }, dd);
        expect(res.status).toBe(502);
        expect((await res.json()).code).toBe("ai_failed");
        expect(await stored()).toBe(kept);
        expect((await t.sql`select 1 from ai_usage where company_id = ${e.id} and kind = 'revise' and success`).length).toBe(count);
        expect((await usageRows(e.id)).at(-1)).toEqual({ kind: "revise", success: false, input_tokens: 30_000, output_tokens: 300, model: "claude-sonnet-5-5" });
        expect((await (await revisions(e.cookie, dd)).json()).revisions.map((r: { request: string }) => r.request)).not.toContain("저장 실패");
      } finally {
        await t.sql.unsafe("drop trigger fail_revision on report_revisions; drop function fail_revision()");
      }
    });
  });
});

describe("생성 중 미리보기 스트림(NDJSON)", () => {
  const d = "2026-11-10";
  let c: { id: string; cookie: string };
  const full = JSON.stringify({
    title: "스트림 보고서",
    basic: [["일자", "2026. 11. 10.(화)"]],
    schedule: [["09:30", "온보딩", "참석"]],
    education: [],
    achievements: [{ t: "현지 거점 확보", sub: ["코워킹 이용"] }],
    special: [],
    insights: [{ t: "현지 수요 확인", sub: ["근거: 강연"] }],
    plans: ["후속 미팅 준비"],
    attachments: ["강연 자료"],
  });
  type Line = { type: string; [k: string]: unknown };
  const generateStream = async (cookie: string, body: unknown = {}, dd = d) => {
    const r = request("POST", "/x", { cookie, body });
    r.headers.set("accept", "application/x-ndjson");
    return (await import("@/app/api/days/[date]/report/route")).POST(r, params({ date: dd }));
  };
  const lines = async (res: Response): Promise<Line[]> => (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  /** 텍스트를 몇 글자씩 onText로 흘린 뒤 결과를 돌려주는 가짜 모델. gate를 주면 절반을 흘린 뒤 그 약속을 기다린다. */
  const streamed =
    (text: string, gate?: Promise<void>) =>
    async (r: ModelRequest): Promise<ModelResult> => {
      for (let i = 7; i < text.length + 7; i += 7) {
        r.onText?.(text.slice(0, i));
        if (gate && i < text.length / 2 && i + 7 >= text.length / 2) await gate;
      }
      return reply(text);
    };
  const stored = async (companyId: string, dd = d) =>
    (await t.sql<{ title: string; body_html: string; updated_at: Date }[]>`select title, body_html, updated_at from reports where company_id = ${companyId} and report_date = ${dd}`)[0];
  const remaining = async (cookie: string) =>
    (await (await (await import("@/app/api/days/[date]/route")).GET(request("GET", "/x", { cookie }), params({ date: d }))).json()).usage.generateRemaining;
  const withoutPhotos = (html: string) => html.replace(/<div class="photos"[^>]*><\/div>/g, "").replace(/<h2>\d+\. 참여 사진<\/h2>/, "");

  beforeAll(async () => {
    const id = await companyWithPassword(t.sql, "주식회사 스트림", "s-password");
    c = { id, cookie: await loginCookie(id, "s-password") };
  });
  afterEach(runBackground);

  it("start → 섹션이 늘어나는 partial → done 순서로 보내고, done의 보고서는 저장본과 같다", async () => {
    callModel.mockImplementationOnce(streamed(full));
    const res = await generateStream(c.cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    const ls = await lines(res);
    expect(ls[0].type).toBe("start");
    expect(String(ls[0].pad).length).toBeGreaterThanOrEqual(1024);
    expect(ls.at(-1)!.type).toBe("done");
    const partials = ls.slice(1, -1);
    expect(partials.every((l) => l.type === "partial")).toBe(true);
    const htmls = partials.map((l) => String(l.html));
    expect(htmls[0]).toBe("<h1>스트림 보고서</h1>");
    for (let i = 1; i < htmls.length; i++) {
      expect(htmls[i].startsWith(htmls[i - 1])).toBe(true);
      expect(htmls[i].length).toBeGreaterThan(htmls[i - 1].length);
    }
    const done = ls.at(-1) as unknown as { report: { title: string; bodyHtml: string; updatedAt: string }; usage: { generateRemaining: number } };
    const row = await stored(c.id);
    expect(done.report).toEqual({ title: row.title, bodyHtml: row.body_html, updatedAt: row.updated_at.toISOString() });
    expect(htmls.at(-1)).toBe(withoutPhotos(row.body_html));
    expect(htmls.at(-1)).toContain("<h2>붙임</h2>");
    expect(done.usage.generateRemaining).toBe(4);
    expect((await t.sql`select 1 from ai_inflight where company_id = ${c.id}`).length).toBe(0);
  });

  it("Accept가 없으면 지금처럼 JSON으로 답한다", async () => {
    callModel.mockImplementationOnce(streamed(full));
    const res = await generate(c.cookie, { overwrite: true }, d);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect((await res.json()).report.title).toBe("스트림 보고서");
    expect(callModel.mock.calls[0][0].onText).toBeUndefined();
  });

  it("사전 검사 실패는 스트림을 열지 않고 JSON 오류로 답한다", async () => {
    const exists = await generateStream(c.cookie);
    expect(exists.status).toBe(409);
    expect(exists.headers.get("content-type")).toContain("application/json");
    expect((await exists.json()).code).toBe("report_exists");
    await t.sql`update companies set daily_generate_limit = 0 where id = ${c.id}`;
    try {
      const limited = await generateStream(c.cookie, { overwrite: true });
      expect(limited.status).toBe(429);
      expect((await limited.json()).code).toBe("limit_reached");
    } finally {
      await t.sql`update companies set daily_generate_limit = 5 where id = ${c.id}`;
    }
    await t.sql`insert into ai_inflight (company_id) values (${c.id})`;
    try {
      const busy = await generateStream(c.cookie, { overwrite: true });
      expect(busy.status).toBe(409);
      expect((await busy.json()).code).toBe("in_progress");
    } finally {
      await t.sql`delete from ai_inflight where company_id = ${c.id}`;
    }
    expect((await generateStream(c.cookie, {}, "2026-13-01")).status).toBe(400);
    expect((await generateStream("gmep_session=nope")).status).toBe(401);
    expect(callModel).not.toHaveBeenCalled();
  });

  it("첫 응답을 읽지 못하면 reset을 보내고 다시 받은 결과로 끝낸다", async () => {
    const cut = '{"title":"잘린 보고서","basic":[["일자","x"]],"schedule":[["09';
    callModel.mockImplementationOnce(streamed(cut)).mockImplementationOnce(streamed(full));
    const ls = await lines(await generateStream(c.cookie, { overwrite: true }));
    const types = ls.map((l) => l.type);
    const reset = types.indexOf("reset");
    expect(types[0]).toBe("start");
    expect(reset).toBeGreaterThan(1);
    expect(types.slice(1, reset).every((x) => x === "partial")).toBe(true);
    expect(types.filter((x) => x === "reset")).toHaveLength(1);
    expect(types.at(-1)).toBe("done");
    const after = ls.slice(reset + 1, -1);
    expect(after.length).toBeGreaterThan(0);
    expect(after.some((l) => String(l.html).includes("잘린 보고서"))).toBe(false);
    expect((ls.at(-1) as unknown as { report: { title: string } }).report.title).toBe("스트림 보고서");
  });

  it("두 번 다 읽지 못하면 error 줄로 끝내고 보고서와 남은 횟수는 그대로다", async () => {
    const before = await stored(c.id);
    const left = await remaining(c.cookie);
    callModel.mockImplementationOnce(streamed("설명만 있음")).mockImplementationOnce(streamed("또 설명"));
    const ls = await lines(await generateStream(c.cookie, { overwrite: true }));
    expect(ls.map((l) => l.type)).toEqual(["start", "reset", "error"]);
    expect(ls.at(-1)).toEqual({ type: "error", code: "ai_parse_failed", message: "보고서 형식을 만들지 못했습니다. 다시 시도해 주세요(횟수는 차감되지 않았습니다)" });
    expect(await stored(c.id)).toEqual(before);
    expect(await remaining(c.cookie)).toBe(left);
    expect((await t.sql`select 1 from ai_inflight where company_id = ${c.id}`).length).toBe(0);
  });

  it("AI 호출이 실패하면 ai_failed error 줄을 보낸다", async () => {
    callModel.mockRejectedValueOnce(new Error("overloaded"));
    const ls = await lines(await generateStream(c.cookie, { overwrite: true }));
    expect(ls.at(-1)).toEqual({ type: "error", code: "ai_failed", message: "AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요(횟수는 차감되지 않았습니다)" });
  });

  it("브라우저가 스트림을 끊어도 생성·저장·사용량 기록·진행 기록 해제를 끝까지 한다", async () => {
    const dd = "2026-11-11";
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    callModel.mockImplementationOnce(streamed(full, gate));
    const usageBefore = (await usageRows(c.id)).length;
    const res = await generateStream(c.cookie, {}, dd);
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(JSON.parse(first.split("\n")[0]).type).toBe("start");
    await reader.cancel();
    release();
    expect(background).toHaveLength(1);
    await runBackground();
    expect((await stored(c.id, dd)).title).toBe("스트림 보고서");
    const rows = await usageRows(c.id);
    expect(rows).toHaveLength(usageBefore + 1);
    expect(rows.at(-1)).toMatchObject({ kind: "generate", success: true });
    expect((await t.sql`select 1 from ai_inflight where company_id = ${c.id}`).length).toBe(0);
  });

  it("다른 회사 세션으로 만들면 그 회사 보고서만 생기고 이 회사 보고서는 바뀌지 않는다", async () => {
    const mine = await stored(c.id);
    const otherId = await companyWithPassword(t.sql, "주식회사 다른곳", "o-password");
    const other = await loginCookie(otherId, "o-password");
    callModel.mockImplementationOnce(streamed(JSON.stringify({ title: "다른 회사 보고서" })));
    const ls = await lines(await generateStream(other));
    expect(ls.at(-1)!.type).toBe("done");
    expect((await stored(otherId)).title).toBe("다른 회사 보고서");
    expect(await stored(c.id)).toEqual(mine);
  });
});
