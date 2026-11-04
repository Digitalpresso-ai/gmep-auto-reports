import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelStreamError, callModel, userContent } from "@/server/ai";

// SDK 클라이언트만 가짜로 바꾸고 callModel의 이벤트 해석은 실제로 돌린다
const create = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({ default: class { beta = { messages: { create } }; } }));

const img = { mediaType: "image/jpeg" as const, base64: "AAA" };

describe("AI-13 프롬프트 캐싱", () => {
  it("캐시를 요청하면 이미지와 프롬프트까지 캐시하고, 뒤에 붙는 지시는 캐시 밖에 둔다", () => {
    expect(userContent({ model: "m", prompt: "자료", images: [img], cacheTtl: "1h", followUp: "수정 요청" })).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAA" } },
      { type: "text", text: "자료", cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: "수정 요청" },
    ]);
  });

  it("캐시를 요청하지 않으면 표시를 붙이지 않는다", () => {
    expect(userContent({ model: "m", prompt: "사진 설명", images: [] })).toEqual([{ type: "text", text: "사진 설명" }]);
  });
});

async function* events(list: unknown[]) {
  for (const e of list) yield e;
}
const start = (model = "claude-sonnet-5-5") => ({
  type: "message_start",
  message: { model, usage: { input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 20_000, cache_creation_input_tokens: 9_000 } },
});
const text = (index: number, t: string) => ({ type: "content_block_delta", index, delta: { type: "text_delta", text: t } });
const end = (stop: string, output = 700) => ({ type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: output } });

describe("생성 응답 스트리밍", () => {
  beforeEach(() => create.mockReset());

  it("onText를 주면 스트림으로 받아 조각마다 지금까지 쌓인 텍스트를 넘기고, 사용량은 시작·끝 이벤트에서 모은다", async () => {
    create.mockResolvedValueOnce(
      events([
        start(),
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "생각" } },
        { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
        text(1, '{"title":'),
        text(1, '"t"}'),
        { type: "content_block_stop", index: 1 },
        end("end_turn"),
        { type: "message_stop" },
      ]),
    );
    const seen: string[] = [];
    const r = await callModel({ model: "m", prompt: "p", images: [], onText: (s) => seen.push(s) });
    expect(create.mock.calls[0][0].stream).toBe(true);
    expect(seen).toEqual(['{"title":', '{"title":"t"}']);
    expect(r).toEqual({
      text: '{"title":"t"}',
      inputTokens: 29_100,
      outputTokens: 700,
      model: "claude-sonnet-5-5",
      stopReason: "end_turn",
      cacheReadTokens: 20_000,
      cacheWriteTokens: 9_000,
    });
  });

  // 독립 리뷰(gen-stream-v1)에서 재현: 사용량을 받은 뒤 스트림이 끊기면 그 토큰이 0으로 기록됐다
  it("스트림이 도중에 끊기면 그때까지 받은 사용량과 모델을 담은 ModelStreamError를 던진다", async () => {
    async function* broken() {
      yield start();
      yield { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } };
      yield text(0, "{");
      throw new Error("socket hang up");
    }
    create.mockResolvedValueOnce(broken());
    const err = await callModel({ model: "m", prompt: "p", images: [], onText: () => {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ModelStreamError);
    expect(err.usage).toEqual({ input: 29_100, output: 1, cacheRead: 20_000, cacheWrite: 9_000 });
    expect(err.model).toBe("claude-sonnet-5-5");
  });

  it("거절로 끝나면 받은 텍스트를 버린다", async () => {
    create.mockResolvedValueOnce(
      events([start(), { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, text(0, "{"), end("refusal", 3)]),
    );
    const r = await callModel({ model: "m", prompt: "p", images: [], onText: () => {} });
    expect(r.text).toBe("");
    expect(r.stopReason).toBe("refusal");
  });

  it("서버가 다른 모델로 이어받으면 그 모델을 기록한다", async () => {
    create.mockResolvedValueOnce(
      events([
        start("claude-a"),
        { type: "content_block_start", index: 0, content_block: { type: "fallback", to: { model: "claude-b" } } },
        { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
        text(1, "{}"),
        end("end_turn"),
      ]),
    );
    const r = await callModel({ model: "m", prompt: "p", images: [], onText: () => {} });
    expect(r.model).toBe("claude-b");
    expect(r.text).toBe("{}");
  });

  it("onText가 없으면 스트림 없이 한 번에 받는다", async () => {
    create.mockResolvedValueOnce({
      stop_reason: "end_turn",
      model: "claude-sonnet-5-5",
      content: [{ type: "text", text: "설명" }],
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: null, cache_creation_input_tokens: null },
    });
    const r = await callModel({ model: "m", prompt: "p", images: [] });
    expect(create.mock.calls[0][0].stream).toBeUndefined();
    expect(r).toMatchObject({ text: "설명", inputTokens: 10, outputTokens: 5 });
  });
});
