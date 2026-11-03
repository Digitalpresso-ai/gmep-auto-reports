import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelRequest, ModelResult } from "@/server/ai";
import { objects } from "./fake-storage";
import { companyWithPassword, loginCookie, params, request, startDb, type TestDb } from "./harness";

vi.mock("@/server/storage", () => import("./fake-storage"));
const callModel = vi.fn<(r: ModelRequest) => Promise<ModelResult>>();
vi.mock("@/server/ai", () => ({ callModel: (r: ModelRequest) => callModel(r) }));

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
beforeEach(() => callModel.mockReset());

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

describe("PHOTO-2 사진 배치", () => {
  it("고른 사진의 설명을 선택 순서대로 프롬프트에 넣고, AI가 고른 섹션 옆에 사진 자리를 만든다", async () => {
    const d = "2026-11-05";
    const cId = await companyWithPassword(t.sql, "주식회사 긱토", "c-password");
    const c = { cookie: await loginCookie(cId, "c-password") };
    await t.sql`insert into shared_days (report_date) values (${d})`;
    const [p1] = await t.sql<{ id: string }[]>`insert into shared_files (report_date, kind, storage_path, filename, width, height, description)
      values (${d}, 'photo', 'shared/2026-11-05/p1.jpg', 'p1.jpg', 1100, 825, '[강연] 발표 장면') returning id`;
    const [p2] = await t.sql<{ id: string }[]>`insert into shared_files (report_date, kind, storage_path, filename, width, height)
      values (${d}, 'photo', 'shared/2026-11-05/p2.jpg', 'p2.jpg', 1100, 825) returning id`;
    const selectedPhotos = [{ source: "shared", id: p2.id }, { source: "shared", id: p1.id }];
    await (await import("@/app/api/days/[date]/draft/route")).PUT(request("PUT", "/x", { cookie: c.cookie, body: { selectedPhotos } }), params({ date: d }));
    callModel.mockResolvedValueOnce(
      reply(JSON.stringify({ title: "t", education: [{ title: "3-1. 강연", items: [{ t: "시장", sub: [] }], table: null }], photos: [{ no: 2, place: "edu:1" }, { no: 1, place: "photos" }] })),
    );
    const body = await (await generate(c.cookie, {}, d)).json();
    const req = callModel.mock.calls[0][0];
    expect(req.prompt).toContain("[사진 1] (설명 없음)\n[사진 2] [강연] 발표 장면");
    expect(req.images).toHaveLength(0);
    expect(req.jsonSchema).toBeDefined();
    expect(body.report.bodyHtml).toContain(`<ul><li>시장</li></ul><div class="photos" data-photos="shared:${p1.id}"></div>`);
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
  const revised = (title: string, photos = [{ no: 1, place: "schedule" }]) =>
    reply(JSON.stringify({ title, schedule: [["09:30", "온보딩", "참석"]], achievements: [{ t: "성과", sub: [] }], photos }), 30_000, 900, 28_000, 0);

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

  it("보고서가 없으면 수정할 수 없다", async () => {
    const res = await revise(c.cookie, { request: "시사점을 더 구체적으로" });
    expect(res.status).toBe(404);
    expect(callModel).not.toHaveBeenCalled();
  });

  it("생성 프롬프트를 그대로 캐시 블록으로 두고, 직접 고친 현재 보고서와 수정 요청을 뒤에 붙인다", async () => {
    callModel.mockResolvedValueOnce(reply(JSON.stringify({ title: "처음", schedule: [["09:30", "온보딩", "참석"]], photos: [{ no: 1, place: "photos" }, { no: 2, place: "schedule" }] })));
    expect((await generate(c.cookie, {}, d)).status).toBe(200);
    const genReq = callModel.mock.calls[0][0];
    const current = (await (await getReport(c.cookie, d)).json()).bodyHtml as string;
    await saveReport(c.cookie, { bodyHtml: current.replace("<h1>처음</h1>", "<h1>직접 고친 제목</h1>") }, d);

    callModel.mockResolvedValueOnce(revised("시사점 보강"));
    const res = await revise(c.cookie, { request: "  시사점을 더 구체적으로  " });
    expect(res.status).toBe(200);
    const body = await res.json();
    const req = callModel.mock.calls[1][0];
    expect(req.prompt).toBe(genReq.prompt);
    expect(req.images).toEqual(genReq.images);
    expect(req.cacheTtl).toBe("1h");
    expect(req.jsonSchema).toBe(genReq.jsonSchema);
    expect(req.followUp).toContain("<h1>직접 고친 제목</h1>");
    // 사진 자리는 사진 키 대신 프롬프트의 사진 번호로 보여 준다
    expect(req.followUp).toContain("<p>[사진 2]</p>");
    expect(req.followUp).not.toContain("shared:");
    expect(req.followUp).toContain("[이번 수정 요청]\n시사점을 더 구체적으로");
    expect(req.followUp).toContain("[지난 수정 요청 — 오래된 순, 모두 현재 보고서에 반영됨]\n(없음)");
    expect(body.report.title).toBe("시사점 보강");
    expect(body.report.bodyHtml).toContain(`<div class="photos" data-photos="shared:${p1}"></div>`);
    expect(body.revisions.map((r: { request: string }) => r.request)).toEqual(["시사점을 더 구체적으로"]);
    expect(body.usage).toMatchObject({ reviseUsed: 1, reviseLimit: 15, reviseRemaining: 14, generateRemaining: 4 });
    expect((await (await getReport(c.cookie, d)).json()).title).toBe("시사점 보강");
    const [row] = await t.sql`select kind, success, cache_read_tokens from ai_usage where company_id = ${c.id} order by id desc limit 1`;
    expect(row).toEqual({ kind: "revise", success: true, cache_read_tokens: 28_000 });
  });

  it("다음 수정 때 지난 수정 요청을 모두 순서대로 보낸다", async () => {
    callModel.mockResolvedValueOnce(revised("짧게"));
    expect((await revise(c.cookie, { request: "아까 바꾼 시사점을 조금 짧게" })).status).toBe(200);
    callModel.mockResolvedValueOnce(revised("표"));
    expect((await revise(c.cookie, { request: "일정 표에 장소 추가" })).status).toBe(200);
    const req = callModel.mock.calls[1][0];
    expect(req.followUp).toContain("[지난 수정 요청 — 오래된 순, 모두 현재 보고서에 반영됨]\n1. 시사점을 더 구체적으로\n2. 아까 바꾼 시사점을 조금 짧게\n");
    expect(req.followUp).toContain("[이번 수정 요청]\n일정 표에 장소 추가");
    const list = await (await revisions(c.cookie)).json();
    expect(list.revisions.map((r: { request: string }) => r.request)).toEqual(["시사점을 더 구체적으로", "아까 바꾼 시사점을 조금 짧게", "일정 표에 장소 추가"]);
  });

  it("AI가 실패하면 보고서·대화를 바꾸지 않고 횟수도 차감하지 않는다", async () => {
    callModel.mockRejectedValueOnce(new Error("overloaded"));
    const res = await revise(c.cookie, { request: "실패할 요청" });
    expect(res.status).toBe(502);
    expect((await (await getReport(c.cookie, d)).json()).title).toBe("표");
    expect((await (await revisions(c.cookie)).json()).revisions).toHaveLength(3);
    const day = await (await (await import("@/app/api/days/[date]/route")).GET(request("GET", "/x", { cookie: c.cookie }), params({ date: d }))).json();
    expect(day.usage.reviseRemaining).toBe(12);
  });

  it("빈 요청이나 너무 긴 요청은 받지 않는다", async () => {
    expect((await revise(c.cookie, { request: "   " })).status).toBe(400);
    expect((await revise(c.cookie, { request: "가".repeat(1001) })).status).toBe(400);
    expect(callModel).not.toHaveBeenCalled();
  });

  it("하루 수정 한도를 다 쓰면 AI를 부르지 않는다(AI-9)", async () => {
    await t.sql`update companies set daily_revise_limit = 3 where id = ${c.id}`;
    const res = await revise(c.cookie, { request: "한 번 더" });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("limit_reached");
    expect(callModel).not.toHaveBeenCalled();
    await t.sql`update companies set daily_revise_limit = 15 where id = ${c.id}`;
  });

  it("다른 회사는 이 회사의 수정 대화를 보거나 이 날짜 보고서를 고칠 수 없다(AUTH-8)", async () => {
    expect((await (await revisions(b.cookie)).json()).revisions).toEqual([]);
    expect((await revise(b.cookie, { request: "침입" })).status).toBe(404);
    expect(callModel).not.toHaveBeenCalled();
  });

  it("보고서를 다시 만들면 수정 대화를 지운다", async () => {
    callModel.mockResolvedValueOnce(reply(goodJson));
    expect((await generate(c.cookie, { overwrite: true }, d)).status).toBe(200);
    expect((await (await revisions(c.cookie)).json()).revisions).toEqual([]);
  });
});
