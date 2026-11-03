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
};
export type ModelResult = { text: string; inputTokens: number; outputTokens: number; model: string; stopReason: string | null };

let client: Anthropic | undefined;

export async function callModel(req: ModelRequest): Promise<ModelResult> {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
  const response = await client.beta.messages.create({
    model: req.model,
    max_tokens: req.maxTokens ?? MAX_TOKENS,
    output_config: { effort: req.effort ?? "medium", ...(req.jsonSchema ? { format: { type: "json_schema" as const, schema: req.jsonSchema } } : {}) },
    // 안전 분류기가 거절하면 서버가 다른 모델로 다시 시도한다
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [
      {
        role: "user",
        content: [
          ...req.images.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 } })),
          { type: "text" as const, text: req.prompt },
        ],
      },
    ],
  });
  const text = response.stop_reason === "refusal" ? "" : response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return {
    text,
    inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
    model: response.model,
    stopReason: response.stop_reason,
  };
}
