import "server-only";
import Anthropic from "@anthropic-ai/sdk";

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
