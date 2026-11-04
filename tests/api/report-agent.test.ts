// ReAct 보고서 생성 루프(report-agent.ts)와 그 모델 호출(ai.ts streamModel)의 행동 검사.
// 실제 Anthropic 호출은 하지 않는다. 앞부분은 SDK 스트림을 가짜로 바꿔 요청 본문과 이벤트 처리를, 뒷부분은 streamModel을 가짜로 바꿔 루프를 본다.
import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamRequest, StreamResult, ToolUseEvent } from "@/server/ai";
import type { BlockDoc } from "@/server/domain/blocks";
import { GMEP_DAILY } from "@/server/domain/template";

type Msg = Anthropic.Beta.BetaMessageParam;
type RawEvent = Anthropic.Beta.BetaRawMessageStreamEvent;

// ---------- 가짜 SDK ----------

const sdk = vi.hoisted(() => ({ bodies: [] as Record<string, unknown>[], scripts: [] as unknown[][] }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        create: async (body: Record<string, unknown>) => {
          sdk.bodies.push(structuredClone(body));
          const events = sdk.scripts.shift() ?? [];
          return (async function* () {
            for (const e of events) yield e;
          })();
        },
      },
    };
  },
}));

vi.mock("@/server/domain/agent", () => ({
  AGENT_TOOLS: [
    { name: "add_paragraph", description: "문단", strict: true, input_schema: { type: "object", properties: {} } },
    { name: "finish", description: "마침", strict: true, input_schema: { type: "object", properties: {} } },
  ],
}));

const observe = vi.hoisted(() => ({
  checkBlock: (html: string): string[] => (html.includes("길다") ? ["80자를 넘습니다."] : []),
  planIssues: (_t: unknown, sections: { heading: string }[]): string[] => (sections.some((s) => s.heading === "주요 성과") ? [] : ["필수 섹션 '주요 성과'가 계획에 없습니다."]),
  finalChecks: (): string[] => [],
}));
vi.mock("@/server/domain/observe", () => ({
  checkBlock: (h: string) => observe.checkBlock(h),
  planIssues: (t: unknown, s: { heading: string }[]) => observe.planIssues(t, s),
  finalChecks: (...a: unknown[]) => (observe.finalChecks as (...x: unknown[]) => string[])(...a),
}));

const usageOf = (input = 100, output = 10) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
const start = (model = "claude-sonnet-5-5"): RawEvent => ({ type: "message_start", message: { id: "msg", type: "message", role: "assistant", model, content: [], stop_reason: null, usage: usageOf() } }) as unknown as RawEvent;
const toolEvents = (index: number, id: string, name: string, json: string[]): RawEvent[] =>
  [
    { type: "content_block_start", index, content_block: { type: "tool_use", id, name, input: {} } },
    ...json.map((partial_json) => ({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json } })),
    { type: "content_block_stop", index },
  ] as unknown as RawEvent[];
const end = (stop_reason: string, usage: Record<string, number> = { output_tokens: 40, cache_read_input_tokens: 500, cache_creation_input_tokens: 30, input_tokens: 100 }): RawEvent[] =>
  [
    { type: "message_delta", delta: { stop_reason, stop_sequence: null }, usage },
    { type: "message_stop" },
  ] as unknown as RawEvent[];

describe("streamModel", () => {
  beforeEach(() => {
    sdk.bodies.length = 0;
    sdk.scripts.length = 0;
  });

  const base = { model: "claude-sonnet-5-5", prompt: "자료와 규칙", images: [{ mediaType: "image/png" as const, base64: "AAA" }] };

  it("tool 입력을 블록이 끝날 때마다 넘기고, 다음 턴에 쓸 content와 캐시 포함 사용량을 돌려준다", async () => {
    const { streamModel } = await vi.importActual<typeof import("@/server/ai")>("@/server/ai");
    sdk.scripts.push([
      start(),
      ...toolEvents(0, "t1", "add_paragraph", ['{"text":"가', '나","after":null}']),
      ...toolEvents(1, "t2", "finish", ['{"note":', '"끝"}']),
      ...end("tool_use"),
    ]);
    const seen: ToolUseEvent[] = [];
    const r = await streamModel({ ...base, turns: [] }, (t) => seen.push(t));
    expect(seen).toEqual([
      { id: "t1", name: "add_paragraph", input: { text: "가나", after: null } },
      { id: "t2", name: "finish", input: { note: "끝" } },
    ]);
    expect(r.content).toEqual([
      { type: "tool_use", id: "t1", name: "add_paragraph", input: { text: "가나", after: null } },
      { type: "tool_use", id: "t2", name: "finish", input: { note: "끝" } },
    ]);
    expect(r.stopReason).toBe("tool_use");
    expect(r.usage).toEqual({ input: 630, output: 40, cacheRead: 500, cacheWrite: 30 });
    expect(r.firstToolMs).not.toBeNull();
  });

  it("요청은 tools에 eager_input_streaming을 켜고 tool_choice 없이 fallback·effort·max_tokens를 지정한다", async () => {
    const { streamModel } = await vi.importActual<typeof import("@/server/ai")>("@/server/ai");
    sdk.scripts.push([start(), ...end("end_turn")]);
    await streamModel({ ...base, followUp: "수정 요청", turns: [] });
    const body = sdk.bodies[0];
    expect(body.tools).toEqual([
      expect.objectContaining({ name: "add_paragraph", eager_input_streaming: true }),
      expect.objectContaining({ name: "finish", eager_input_streaming: true }),
    ]);
    expect(body).not.toHaveProperty("tool_choice");
    expect(body).not.toHaveProperty("system");
    expect(body).toMatchObject({ stream: true, max_tokens: 8000, output_config: { effort: "medium" }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } },
          { type: "text", text: "자료와 규칙", cache_control: { type: "ephemeral", ttl: "1h" } },
          { type: "text", text: "수정 요청" },
        ],
      },
    ]);
  });

  it("두 번째 턴부터는 첫 user 블록의 1시간 캐시를 두고 마지막 메시지 끝에만 5분 breakpoint를 붙인다", async () => {
    const { streamModel } = await vi.importActual<typeof import("@/server/ai")>("@/server/ai");
    sdk.scripts.push([start(), ...end("end_turn")]);
    const turns: Msg[] = [
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "add_paragraph", input: {} }] },
      // 이전 턴에 붙였던 breakpoint가 남아 있어도 지운다(최대 4개)
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok id=b1", cache_control: { type: "ephemeral", ttl: "5m" } }] },
      { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "add_paragraph", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "ok id=b2" }, { type: "text", text: "이어서" }] },
    ];
    const before = structuredClone(turns);
    await streamModel({ ...base, turns });
    const msgs = sdk.bodies[0].messages as Msg[];
    expect(msgs).toHaveLength(5);
    expect((msgs[0].content as Anthropic.Beta.BetaContentBlockParam[])[1]).toEqual({ type: "text", text: "자료와 규칙", cache_control: { type: "ephemeral", ttl: "1h" } });
    expect(msgs[2].content).toEqual([{ type: "tool_result", tool_use_id: "t1", content: "ok id=b1" }]);
    expect(msgs[4].content).toEqual([
      { type: "tool_result", tool_use_id: "t2", content: "ok id=b2" },
      { type: "text", text: "이어서", cache_control: { type: "ephemeral", ttl: "5m" } },
    ]);
    expect(turns).toEqual(before);
  });

  it("JSON으로 읽을 수 없는 tool 입력은 input null과 오류로 넘기고 스트림은 계속 읽는다", async () => {
    const { streamModel } = await vi.importActual<typeof import("@/server/ai")>("@/server/ai");
    sdk.scripts.push([start(), ...toolEvents(0, "t1", "add_paragraph", ['{"text":"가"', ' 깨짐}']), ...toolEvents(1, "t2", "finish", ['{"note":"끝"}']), ...end("tool_use")]);
    const seen: ToolUseEvent[] = [];
    const r = await streamModel({ ...base, turns: [] }, (t) => seen.push(t));
    expect(seen[0]).toMatchObject({ id: "t1", name: "add_paragraph", input: null });
    expect(JSON.parse(seen[0].error!)).toEqual({ INVALID_JSON: '{"text":"가" 깨짐}' });
    expect(seen[1]).toEqual({ id: "t2", name: "finish", input: { note: "끝" } });
    expect(r.content[0]).toEqual({ type: "tool_use", id: "t1", name: "add_paragraph", input: {} });
  });

  it("fallback 블록이 오면 onFallback을 부르고 그 앞의 tool_use·thinking은 다음 턴 content에서 뺀다", async () => {
    const { streamModel } = await vi.importActual<typeof import("@/server/ai")>("@/server/ai");
    sdk.scripts.push([
      start(),
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } },
      { type: "content_block_stop", index: 0 },
      ...toolEvents(1, "t1", "add_paragraph", ['{"text":"가","after":null}']),
      { type: "content_block_start", index: 2, content_block: { type: "fallback", from: { model: "claude-sonnet-5-5" }, to: { model: "claude-opus-5-5" }, trigger: { type: "refusal" } } },
      { type: "content_block_stop", index: 2 },
      ...toolEvents(3, "t2", "add_paragraph", ['{"text":"다","after":null}']),
      ...end("tool_use"),
    ] as unknown as RawEvent[]);
    const onFallback = vi.fn();
    const r = await streamModel({ ...base, turns: [], onFallback });
    expect(onFallback).toHaveBeenCalledOnce();
    expect(r.model).toBe("claude-opus-5-5");
    expect(r.content.map((b) => b.type)).toEqual(["fallback", "tool_use"]);
    expect(r.content[1]).toMatchObject({ id: "t2" });
  });
});

// ---------- 가짜 streamModel로 ReAct 루프 ----------

type Script = { blocks: ({ type: "tool_use"; id: string; name: string; input: unknown; error?: string } | { type: "fallback" } | { type: "text"; text: string })[]; stopReason: string };

const model = vi.hoisted(() => ({ scripts: [] as Script[], requests: [] as StreamRequest[], log: undefined as string[] | undefined }));

vi.mock("@/server/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/ai")>();
  return {
    ...actual,
    streamModel: async (req: StreamRequest, onToolUse?: (t: ToolUseEvent) => void): Promise<StreamResult> => {
      model.requests.push(structuredClone({ ...req, onFallback: undefined, signal: undefined }));
      const s = model.scripts.shift();
      if (!s) throw new Error("스크립트가 없는 턴");
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      for (const b of s.blocks) {
        if (b.type === "fallback") {
          req.onFallback?.();
          content.length = 0;
          continue;
        }
        if (b.type === "text") {
          content.push(b);
          continue;
        }
        content.push({ type: "tool_use", id: b.id, name: b.name, input: b.error ? {} : (b.input as Record<string, unknown>) });
        model.log?.push(`stream:${b.id}`);
        onToolUse?.(b.error ? { id: b.id, name: b.name, input: null, error: b.error } : { id: b.id, name: b.name, input: b.input });
      }
      model.log?.push("stream:end");
      return { content, stopReason: s.stopReason, model: req.model, usage: { input: 1000, output: 50, cacheRead: 800, cacheWrite: 0 }, latencyMs: 5, firstToolMs: 1 };
    },
  };
});

const tu = (id: string, name: string, input: unknown) => ({ type: "tool_use" as const, id, name, input });
const para = (id: string, text: string, after: string | null = null) => tu(id, "add_paragraph", { text, after });
const plan = (id: string, headings: string[]) => tu(id, "plan_outline", { sections: headings.map((heading) => ({ heading, intent: "" })) });
const finish = (id: string) => tu(id, "finish", { note: "" });

const empty: BlockDoc = { blocks: [] };
// 나머지 사진 섹션을 두지 않은 양식으로 결과 HTML을 단순하게 본다
const template = { ...GMEP_DAILY, restPhotosSection: undefined };

async function run(scripts: Script[], over: Partial<Parameters<typeof import("@/server/report-agent").runReportAgent>[0]> = {}) {
  const { runReportAgent } = await import("@/server/report-agent");
  model.scripts = scripts;
  model.requests = [];
  const events: Record<string, unknown>[] = [];
  const result = await runReportAgent({ model: "claude-sonnet-5-5", prompt: "P", images: [], template, doc: empty, mode: "generate", onEvent: (e) => events.push(e), ...over });
  return { result, events, requests: model.requests };
}

const toolResults = (m: Msg) => (m.content as Anthropic.Beta.BetaContentBlockParam[]).filter((b): b is Anthropic.Beta.BetaToolResultBlockParam => b.type === "tool_result");

describe("runReportAgent", () => {
  beforeEach(() => {
    observe.finalChecks = () => [];
  });

  it("한 응답에 계획·블록 여러 개·finish가 오면 1턴에 끝나고 블록 이벤트가 순서대로 나온다", async () => {
    const { result, events } = await run([{ blocks: [plan("p", ["기본 정보", "주요 성과"]), para("a", "가"), para("b", "나"), finish("f")], stopReason: "tool_use" }]);
    expect(result).toMatchObject({ ok: true, html: "<p>가</p><p>나</p>", turns: 1, issues: [] });
    expect(events.map((e) => e.type)).toEqual(["plan", "block", "block", "turn"]);
    expect(events[0]).toEqual({ type: "plan", sections: [{ heading: "기본 정보", intent: "" }, { heading: "주요 성과", intent: "" }] });
    expect(events.slice(1, 3)).toEqual([
      { type: "block", op: "add_paragraph", id: "b1", html: "<p>가</p>" },
      { type: "block", op: "add_paragraph", id: "b2", html: "<p>나</p>" },
    ]);
    if (result.ok) expect(result.usages).toHaveLength(1);
  });

  it("블록 이벤트는 턴이 끝나기 전, 그 tool_use가 끝나는 즉시 나간다", async () => {
    const log: string[] = [];
    model.log = log;
    await run(
      [{ blocks: [para("a", "가"), para("b", "나"), finish("f")], stopReason: "tool_use" }],
      { onEvent: (e) => log.push(e.type === "block" ? `event:${String(e.id)}` : `event:${e.type}`) },
    );
    model.log = undefined;
    expect(log).toEqual(["stream:a", "event:b1", "stream:b", "event:b2", "stream:f", "stream:end", "event:turn"]);
  });

  it("두 턴에 나눠 오면 tool_result가 tool_use id와 짝지어 한 user 메시지로 돌아간다", async () => {
    const { result, requests } = await run([
      { blocks: [plan("p", ["주요 성과"]), para("a", "가")], stopReason: "tool_use" },
      { blocks: [para("b", "나"), finish("f")], stopReason: "tool_use" },
    ]);
    expect(result).toMatchObject({ ok: true, html: "<p>가</p><p>나</p>", turns: 2 });
    expect(requests).toHaveLength(2);
    expect(requests[0].turns).toEqual([]);
    const turns = requests[1].turns;
    expect(turns).toHaveLength(2);
    expect(turns[0]).toEqual({ role: "assistant", content: [plan("p", ["주요 성과"]), para("a", "가")] });
    expect(turns[1].role).toBe("user");
    expect(toolResults(turns[1]).map((b) => [b.tool_use_id, b.content, b.is_error ?? false])).toEqual([
      ["p", "ok", false],
      ["a", "ok id=b1", false],
    ]);
  });

  it("계획에 빠진 필수 섹션은 plan_outline의 tool_result로 돌려준다", async () => {
    const { requests } = await run([
      { blocks: [plan("p", ["기본 정보"])], stopReason: "tool_use" },
      { blocks: [finish("f")], stopReason: "tool_use" },
    ]);
    expect(toolResults(requests[1].turns[1])[0].content).toContain("주요 성과");
  });

  it("없는 블록 id를 쓰면 is_error tool_result를 돌려주고 문서는 그대로 둔다", async () => {
    const { result, events, requests } = await run([
      { blocks: [para("a", "가"), tu("r", "replace_paragraph", { id: "b9", text: "x" })], stopReason: "tool_use" },
      { blocks: [finish("f")], stopReason: "tool_use" },
    ]);
    const [, bad] = toolResults(requests[1].turns[1]);
    expect(bad).toMatchObject({ tool_use_id: "r", is_error: true });
    expect(String(bad.content)).toContain("b9");
    expect(events.filter((e) => e.type === "block")).toHaveLength(1);
    expect(result).toMatchObject({ ok: true, html: "<p>가</p>" });
  });

  it("JSON으로 읽지 못한 tool 입력은 실행하지 않고 is_error로 돌려준다", async () => {
    const { requests } = await run([
      { blocks: [{ ...para("a", "가"), error: "INVALID_JSON" }], stopReason: "tool_use" },
      { blocks: [finish("f")], stopReason: "tool_use" },
    ]);
    expect(toolResults(requests[1].turns[1])[0]).toMatchObject({ tool_use_id: "a", is_error: true });
  });

  it("checkBlock 위반을 성공한 블록의 tool_result 문구에 붙인다", async () => {
    const { requests } = await run([
      { blocks: [para("a", "아주 길다")], stopReason: "tool_use" },
      { blocks: [finish("f")], stopReason: "tool_use" },
    ]);
    const [r] = toolResults(requests[1].turns[1]);
    expect(r.is_error ?? false).toBe(false);
    expect(r.content).toContain("ok id=b1");
    expect(r.content).toContain("80자를 넘습니다.");
  });

  it("finish에서 문제가 나오면 한 번 더 돌리고, 두 번째 finish 뒤에는 남은 문제와 함께 끝낸다", async () => {
    observe.finalChecks = () => ["필수 섹션 '주요 성과'가 없습니다."];
    const { result, events, requests } = await run([
      { blocks: [para("a", "가"), finish("f1")], stopReason: "tool_use" },
      { blocks: [para("b", "나"), finish("f2")], stopReason: "tool_use" },
      { blocks: [finish("f3")], stopReason: "tool_use" },
    ]);
    expect(requests).toHaveLength(2);
    const [, f1] = toolResults(requests[1].turns[1]);
    expect(f1.tool_use_id).toBe("f1");
    expect(f1.content).toContain("주요 성과");
    expect(result).toMatchObject({ ok: true, turns: 2, html: "<p>가</p><p>나</p>", issues: ["필수 섹션 '주요 성과'가 없습니다."] });
    expect(events.filter((e) => e.type === "issues")).toHaveLength(2);
  });

  it("finish 없이 end_turn이면 최종 검사를 해서 통과하면 끝낸다", async () => {
    const { result } = await run([{ blocks: [para("a", "가"), { type: "text", text: "다 썼습니다." }], stopReason: "end_turn" }]);
    expect(result).toMatchObject({ ok: true, turns: 1, issues: [] });
  });

  it("finish 없이 end_turn인데 문제가 있으면 문제를 알려 한 번 더 돌린다", async () => {
    let n = 0;
    observe.finalChecks = () => (n++ === 0 ? ["필수 섹션 '주요 성과'가 없습니다."] : []);
    const { result, requests } = await run([
      { blocks: [{ type: "text", text: "끝" }], stopReason: "end_turn" },
      { blocks: [para("a", "가"), finish("f")], stopReason: "tool_use" },
    ]);
    expect(requests).toHaveLength(2);
    const last = requests[1].turns.at(-1)!;
    expect(last.role).toBe("user");
    expect(JSON.stringify(last.content)).toContain("주요 성과");
    expect(result).toMatchObject({ ok: true, turns: 2, issues: [] });
  });

  it.each([
    ["max_tokens", "max_tokens"],
    ["refusal", "refused"],
  ])("%s이면 그 턴의 tool을 실행하지 않고 실패로 끝내며 사용량은 돌려준다", async (stopReason, reason) => {
    const finalChecks = vi.fn(() => []);
    observe.finalChecks = finalChecks;
    const { result, requests } = await run([{ blocks: [plan("p", ["주요 성과"]), para("a", "가"), finish("f")], stopReason }]);
    expect(result).toEqual({ ok: false, reason, usages: [expect.objectContaining({ input: 1000, output: 50 })] });
    expect(finalChecks).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
  });

  // Codex 독립 리뷰(v2)에서 재현: 블록은 tool_use가 끝날 때 바로 적용되므로 잘리거나 거절된 턴의 블록이 이미 화면에 나가 있다
  it.each(["max_tokens", "refusal"])("%s이면 그 턴에 적용한 블록을 되돌리는 reset 이벤트를 보낸다", async (stopReason) => {
    const doc: BlockDoc = { blocks: [{ id: "b1", html: "<p>원래</p>" }] };
    const { events } = await run([{ blocks: [tu("r", "replace_paragraph", { id: "b1", text: "고침" })], stopReason }], { doc, mode: "revise", followUp: "고쳐 줘" });
    expect(events.at(-1)).toEqual({ type: "reset", html: "<p>원래</p>" });
  });

  it("수정 계획(블록 id)에는 섹션 이름 검사를 하지 않는다", async () => {
    const doc: BlockDoc = { blocks: [{ id: "b1", html: "<p>원래</p>" }] };
    const { requests } = await run(
      [
        { blocks: [plan("p", ["b1"])], stopReason: "tool_use" },
        { blocks: [finish("f")], stopReason: "tool_use" },
      ],
      { doc, mode: "revise", followUp: "고쳐 줘" },
    );
    expect(toolResults(requests[1].turns[1])[0].content).toBe("ok");
  });

  it("턴 한도를 넘으면 실패로 끝내고 쓴 턴의 사용량을 모두 돌려준다", async () => {
    const { result, requests } = await run(
      [
        { blocks: [para("a", "가")], stopReason: "tool_use" },
        { blocks: [para("b", "나")], stopReason: "tool_use" },
        { blocks: [para("c", "다")], stopReason: "tool_use" },
      ],
      { limits: { maxTurns: 2 } },
    );
    expect(requests).toHaveLength(2);
    expect(result).toMatchObject({ ok: false, reason: "turn_limit" });
    expect(result.usages).toHaveLength(2);
  });

  it("시간 한도를 넘으면 다음 턴을 부르지 않고 실패로 끝낸다", async () => {
    const { result, requests } = await run(
      [
        { blocks: [para("a", "가")], stopReason: "tool_use" },
        { blocks: [finish("f")], stopReason: "tool_use" },
      ],
      { limits: { deadlineMs: 0 } },
    );
    expect(requests.length).toBeLessThanOrEqual(1);
    expect(result).toMatchObject({ ok: false, reason: "deadline" });
  });

  it("모델 호출이 실패하면 ai_failed로 끝내고 앞 턴의 사용량은 돌려준다", async () => {
    const { result } = await run([{ blocks: [para("a", "가")], stopReason: "tool_use" }]);
    expect(result).toMatchObject({ ok: false, reason: "ai_failed" });
    expect(result.usages).toHaveLength(1);
  });

  it("fallback이 오면 reset 이벤트를 보내고 그 턴에 앞서 적용한 블록을 되돌린다", async () => {
    const { result, events, requests } = await run([
      { blocks: [para("a", "버릴 문단"), { type: "fallback" }, para("b", "가")], stopReason: "tool_use" },
      { blocks: [finish("f")], stopReason: "tool_use" },
    ]);
    expect(events.map((e) => e.type).slice(0, 3)).toEqual(["block", "reset", "block"]);
    expect(events[1]).toEqual({ type: "reset", html: "" });
    expect(events[2]).toMatchObject({ id: "b1", html: "<p>가</p>" });
    expect(toolResults(requests[1].turns[1]).map((b) => b.tool_use_id)).toEqual(["b"]);
    expect(result).toMatchObject({ ok: true, html: "<p>가</p>" });
  });

  it("수정은 기존 문서에서 시작해 바뀐 블록만 고친다", async () => {
    const doc: BlockDoc = { blocks: [{ id: "b1", html: "<h1>제목</h1>" }, { id: "b2", html: "<p>원래</p>" }] };
    const { result } = await run([{ blocks: [tu("r", "replace_paragraph", { id: "b2", text: "고침" }), finish("f")], stopReason: "tool_use" }], { doc, mode: "revise", followUp: "고쳐 줘" });
    expect(result).toMatchObject({ ok: true, html: "<h1>제목</h1><p>고침</p>" });
  });

  it("빈 문서 생성은 끝날 때 나머지 사진 섹션(제목과 키 없는 사진 자리)을 붙인다", async () => {
    const { result } = await run([{ blocks: [para("a", "가"), finish("f")], stopReason: "tool_use" }], { template: GMEP_DAILY });
    expect(result.ok && result.html).toContain("참여 사진");
    expect(result.ok && result.html).toContain('<div class="photos"></div>');
  });

  // Codex 독립 리뷰(v3)에서 재현: 생성·수정을 시작 문서가 비었는지로 구분하면 빈 보고서 수정이 생성으로 처리된다
  it("빈 문서라도 수정이면 계획에 섹션 검사를 하지 않고 나머지 사진 섹션을 붙이지 않는다", async () => {
    const { result, requests } = await run(
      [
        { blocks: [plan("p", ["b1"]), para("a", "가")], stopReason: "tool_use" },
        { blocks: [finish("f")], stopReason: "tool_use" },
      ],
      { mode: "revise", followUp: "고쳐 줘", template: GMEP_DAILY },
    );
    expect(toolResults(requests[1].turns[1])[0].content).toBe("ok");
    expect(result).toMatchObject({ ok: true, html: "<p>가</p>" });
  });

  it("수정의 마침 검사는 이번 실행에서 바뀐 블록만 보게 한다", async () => {
    const finalChecks = vi.fn<(...args: unknown[]) => string[]>(() => []);
    observe.finalChecks = finalChecks;
    const doc: BlockDoc = { blocks: [{ id: "b1", html: "<p>회사가 쓴 문장</p>" }, { id: "b2", html: "<p>원래</p>" }] };
    await run([{ blocks: [tu("r", "replace_paragraph", { id: "b2", text: "고침" }), finish("f")], stopReason: "tool_use" }], { doc, mode: "revise", followUp: "고쳐 줘" });
    expect(finalChecks.mock.calls[0][2]).toEqual({ changed: new Set(["b2"]) });
  });

  it("회사가 나머지 사진 섹션을 지운 문서를 고치면 그 섹션을 다시 만들지 않는다", async () => {
    const doc: BlockDoc = { blocks: [{ id: "b1", html: "<h2>1. 기본 정보</h2>" }, { id: "b2", html: "<p>원래</p>" }] };
    const { result } = await run([{ blocks: [tu("r", "replace_paragraph", { id: "b2", text: "고침" }), finish("f")], stopReason: "tool_use" }], { doc, mode: "revise", followUp: "고쳐 줘", template: GMEP_DAILY });
    expect(result).toMatchObject({ ok: true, html: "<h2>1. 기본 정보</h2><p>고침</p>" });
  });
});

describe("외부 트레이싱 차단", () => {
  const keys = ["LANGSMITH_TRACING_V2", "LANGCHAIN_TRACING_V2", "LANGSMITH_TRACING", "LANGCHAIN_TRACING", "LANGSMITH_GATEWAY", "LANGSMITH_ENDPOINT", "LANGCHAIN_ENDPOINT"];
  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    for (const k of keys.slice(0, 5)) process.env[k] = "true";
    // 차단이 실패해도 요청이 외부로 나가지 않도록 닫힌 로컬 포트를 가리킨다
    process.env.LANGSMITH_ENDPOINT = "http://127.0.0.1:9";
    process.env.LANGCHAIN_ENDPOINT = "http://127.0.0.1:9";
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("트레이싱 환경변수가 켜져 있어도 report-agent를 불러와 실행하면 LangSmith 추적기가 붙지 않는다", async () => {
    vi.resetModules();
    const { result } = await run([{ blocks: [para("a", "가"), finish("f")], stopReason: "tool_use" }]);
    expect(result.ok).toBe(true);
    const { CallbackManager } = await import("@langchain/core/callbacks/manager");
    const handlers = CallbackManager.configure()?.handlers ?? [];
    expect(handlers.map((h) => h.name)).not.toContain("langchain_tracer");
    expect(process.env.LANGSMITH_GATEWAY).toBe("false");
  });
});
