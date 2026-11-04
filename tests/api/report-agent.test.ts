// ReAct 보고서 생성의 모델 호출(ai.ts streamModel) 행동 검사. 실제 Anthropic 호출은 하지 않고 SDK 스트림을 가짜로 바꿔 요청 본문과 이벤트 처리를 본다.
import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolUseEvent } from "@/server/ai";

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
