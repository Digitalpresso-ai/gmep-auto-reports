import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AGENT_TOOLS } from "./domain/agent";

// Vercel 함수 한도 300초 안에서 끝나도록 SDK 재시도 없이 280초로 자른다(AI-7)
const TIMEOUT_MS = 280_000;
// 지시서 AI-8의 max_tokens. 생각 토큰이 이 안에서 쓰이므로 effort를 medium으로 둔다.
const MAX_TOKENS = 8_000;

export type ModelRequest = {
  model: string;
  prompt: string;
  images: { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }[];
  /** 주면 구조화 출력으로 이 JSON 스키마에 맞는 응답만 받는다. 파싱 실패 재시도(AI-5)가 거의 필요 없어진다. */
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  /** 주면 이미지와 prompt까지를 이 시간 동안 캐시한다(AI-13). 캐시는 앞부분이 바이트 단위로 같을 때만 맞는다. */
  cacheTtl?: "5m" | "1h";
  /** prompt 뒤에 붙이는 캐시 밖의 지시. AI 수정 요청처럼 호출마다 바뀌는 내용이다. */
  followUp?: string;
};
/** inputTokens는 캐시 읽기·쓰기까지 합친 입력 토큰이다. */
export type ModelResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  stopReason: string | null;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

let client: Anthropic | undefined;

export function userContent(req: ModelRequest): Anthropic.Beta.BetaContentBlockParam[] {
  return [
    ...req.images.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 } })),
    { type: "text" as const, text: req.prompt, ...(req.cacheTtl ? { cache_control: { type: "ephemeral" as const, ttl: req.cacheTtl } } : {}) },
    ...(req.followUp ? [{ type: "text" as const, text: req.followUp }] : []),
  ];
}

export async function callModel(req: ModelRequest): Promise<ModelResult> {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
  const response = await client.beta.messages.create({
    model: req.model,
    max_tokens: req.maxTokens ?? MAX_TOKENS,
    output_config: { effort: req.effort ?? "medium", ...(req.jsonSchema ? { format: { type: "json_schema" as const, schema: req.jsonSchema } } : {}) },
    // 안전 분류기가 거절하면 서버가 다른 모델로 다시 시도한다
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: userContent(req) }],
  });
  const cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = response.usage.cache_creation_input_tokens ?? 0;
  const text = response.stop_reason === "refusal" ? "" : response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return {
    text,
    inputTokens: response.usage.input_tokens + cacheReadTokens + cacheWriteTokens,
    outputTokens: response.usage.output_tokens,
    model: response.model,
    stopReason: response.stop_reason,
    cacheReadTokens,
    cacheWriteTokens,
  };
}

// ---------- ReAct 보고서 생성용 스트리밍 호출 ----------

/** content_block_stop 때 넘기는 tool 호출. eager 입력 스트리밍은 서버가 JSON을 검증하지 않으므로 읽지 못하면 input null과 error를 준다. */
export type ToolUseEvent = { id: string; name: string; input: unknown; error?: string };

export type StreamRequest = {
  model: string;
  /** 첫 user 메시지의 캐시 prefix(규칙·양식·자료). 생성과 수정이 같은 바이트여야 캐시를 같이 쓴다. */
  prompt: string;
  images: ModelRequest["images"];
  /** 첫 user 메시지 끝에 붙는 캐시 밖 지시(수정 요청 등). */
  followUp?: string;
  /** 첫 user 메시지 뒤의 assistant·user 턴. 바꾸지 않고 읽기만 한다. */
  turns: Anthropic.Beta.BetaMessageParam[];
  /** 서버 쪽 fallback이 일어나면 부른다. 이어받는 모델은 그 앞의 tool_use를 보지 못한다. */
  onFallback?: () => void;
  signal?: AbortSignal;
};

/** input은 캐시 읽기·쓰기를 포함한 합계다. */
export type StreamUsage = { input: number; output: number; cacheRead: number; cacheWrite: number };

export type StreamResult = {
  /** 다음 요청의 assistant 메시지로 그대로 쓸 블록. fallback 앞의 tool_use·thinking은 뺐다. */
  content: Anthropic.Beta.BetaContentBlockParam[];
  stopReason: string | null;
  /** 실제로 응답한 모델(fallback이면 이어받은 모델). */
  model: string;
  usage: StreamUsage;
  latencyMs: number;
  firstToolMs: number | null;
};

/** 스트림 도중 실패. 그때까지 받은 사용량이 있으면 실어 보낸다(토큰은 이미 썼다). */
export class ModelStreamError extends Error {
  constructor(
    readonly usage: StreamUsage | null,
    readonly model: string | null,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

type AnyBlock = Record<string, unknown> & { type: string };

const withoutCache = (b: AnyBlock): AnyBlock => {
  if (!("cache_control" in b)) return b;
  const { cache_control: _drop, ...rest } = b;
  void _drop;
  return rest as AnyBlock;
};

/**
 * 요청 messages. 첫 user 메시지의 prompt 블록은 1시간 캐시이고, 턴이 쌓이면 마지막 메시지의 마지막 블록에만 5분 breakpoint를 둔다.
 * breakpoint가 마지막 블록에 있어야 다음 턴 요청이 이전 턴 전체를 캐시에서 읽는다. 이전 턴의 breakpoint를 남기면 4개 한도를 넘는다.
 */
function agentMessages(req: StreamRequest): Anthropic.Beta.BetaMessageParam[] {
  const first: Anthropic.Beta.BetaMessageParam = { role: "user", content: userContent({ ...req, cacheTtl: "1h" }) };
  const rest = req.turns.map((m, i): Anthropic.Beta.BetaMessageParam => {
    const blocks: AnyBlock[] = typeof m.content === "string" ? [{ type: "text", text: m.content }] : (m.content as unknown as AnyBlock[]).map(withoutCache);
    if (i === req.turns.length - 1 && blocks.length) blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral", ttl: "5m" } };
    return { ...m, content: blocks } as unknown as Anthropic.Beta.BetaMessageParam;
  });
  return [first, ...rest];
}

// fallback 앞에서 거절한 모델이 낸 블록 중 다시 보내면 안 되는 종류(텍스트는 이어받은 모델의 맥락이라 남긴다)
const DROP_BEFORE_FALLBACK = new Set(["thinking", "redacted_thinking", "tool_use", "server_tool_use"]);

/**
 * AGENT_TOOLS로 한 턴을 스트리밍한다. tool_choice는 auto(미지정)다. Sonnet 5.5는 any/tool을 400으로 거부한다.
 * SDK의 stream() 대신 raw 이벤트(create stream:true)를 읽는다. stream()은 tool 입력 JSON을 못 읽으면 스트림 전체를 오류로 끝내서,
 * 한 블록의 깨진 입력 때문에 같은 응답의 다른 블록과 사용량까지 잃는다. 여기서는 블록마다 직접 JSON.parse하고 실패만 그 블록에 돌려준다.
 */
export async function streamModel(req: StreamRequest, onToolUse?: (t: ToolUseEvent) => void): Promise<StreamResult> {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
  const started = Date.now();
  const blocks: AnyBlock[] = [];
  const json = new Map<number, string>();
  let usage: StreamUsage | null = null;
  let model: string | null = null;
  let stopReason: string | null = null;
  let firstToolMs: number | null = null;

  const setUsage = (u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) => {
    const prev = usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const cacheRead = u.cache_read_input_tokens ?? prev.cacheRead;
    const cacheWrite = u.cache_creation_input_tokens ?? prev.cacheWrite;
    const uncached = u.input_tokens ?? prev.input - prev.cacheRead - prev.cacheWrite;
    usage = { input: uncached + cacheRead + cacheWrite, output: u.output_tokens ?? prev.output, cacheRead, cacheWrite };
  };

  try {
    const stream = await client.beta.messages.create(
      {
        model: req.model,
        max_tokens: MAX_TOKENS,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        tools: AGENT_TOOLS.map((t) => ({ ...t, eager_input_streaming: true })) as unknown as Anthropic.Beta.BetaToolUnion[],
        messages: agentMessages(req),
        stream: true,
      },
      { signal: req.signal },
    );
    for await (const ev of stream) {
      switch (ev.type) {
        case "message_start":
          model = ev.message.model;
          setUsage(ev.message.usage);
          break;
        case "content_block_start": {
          const b = { ...(ev.content_block as unknown as AnyBlock) };
          blocks[ev.index] = b;
          if (b.type === "tool_use") json.set(ev.index, "");
          if (b.type === "fallback") {
            model = (b.to as { model: string }).model;
            req.onFallback?.();
          }
          break;
        }
        case "content_block_delta": {
          const b = blocks[ev.index];
          const d = ev.delta;
          if (d.type === "input_json_delta") json.set(ev.index, (json.get(ev.index) ?? "") + d.partial_json);
          else if (d.type === "text_delta" && b?.type === "text") b.text = String(b.text ?? "") + d.text;
          else if (d.type === "thinking_delta" && b?.type === "thinking") b.thinking = String(b.thinking ?? "") + d.thinking;
          else if (d.type === "signature_delta" && b?.type === "thinking") b.signature = d.signature;
          else if (d.type === "citations_delta" && b?.type === "text") b.citations = [...((b.citations as unknown[] | null) ?? []), d.citation];
          break;
        }
        case "content_block_stop": {
          const b = blocks[ev.index];
          if (b?.type !== "tool_use") break;
          const raw = json.get(ev.index) ?? "";
          firstToolMs ??= Date.now() - started;
          const id = String(b.id);
          const name = String(b.name);
          let input: unknown;
          try {
            input = raw.trim() ? JSON.parse(raw) : {};
          } catch {
            // 다음 턴에 그대로 보낼 assistant 블록은 객체 입력이어야 한다. 실패는 tool_result(is_error)로 알린다.
            b.input = {};
            onToolUse?.({ id, name, input: null, error: JSON.stringify({ INVALID_JSON: raw }) });
            break;
          }
          b.input = input;
          onToolUse?.({ id, name, input });
          break;
        }
        case "message_delta":
          stopReason = ev.delta.stop_reason;
          setUsage(ev.usage);
          break;
      }
    }
  } catch (err) {
    throw new ModelStreamError(usage, model, err);
  }

  const lastFallback = blocks.findLastIndex((b) => b?.type === "fallback");
  const content = blocks.filter((b, i) => b && !(i < lastFallback && DROP_BEFORE_FALLBACK.has(b.type)));
  return {
    content: content as unknown as Anthropic.Beta.BetaContentBlockParam[],
    stopReason,
    model: model ?? req.model,
    usage: usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    latencyMs: Date.now() - started,
    firstToolMs,
  };
}
