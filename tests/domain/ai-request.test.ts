import { describe, expect, it } from "vitest";
import { userContent } from "@/server/ai";

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
