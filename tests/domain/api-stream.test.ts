import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiStream } from "@/client/api";

// 생성 스트리밍(AI-14 후속): 서버가 보내는 NDJSON을 줄 단위로 읽는다. 조각 경계가 줄 중간에 걸려도 한 줄씩 넘겨야 한다.
const enc = new TextEncoder();
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const s of chunks) c.enqueue(enc.encode(s));
      c.close();
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("apiStream", () => {
  it("조각 경계와 관계없이 NDJSON 한 줄씩 넘기고, 빈 줄은 건너뛴다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf(['{"type":"start"}\n{"type":"par', 'tial","html":"<h1>가</h1>"}\n\n', '{"type":"done"}']), { headers: { "content-type": "application/x-ndjson" } })));
    const seen: unknown[] = [];
    await apiStream("/x", { overwrite: false }, (line) => seen.push(line));
    expect(seen).toEqual([{ type: "start" }, { type: "partial", html: "<h1>가</h1>" }, { type: "done" }]);
  });

  it("NDJSON을 받겠다고 요청한다", async () => {
    const f = vi.fn(async () => new Response(streamOf([]), { headers: { "content-type": "application/x-ndjson" } }));
    vi.stubGlobal("fetch", f);
    await apiStream("/x", {}, () => {});
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new Headers(init.headers).get("accept")).toBe("application/x-ndjson");
    expect(init.method).toBe("POST");
  });

  it("스트림을 열기 전의 JSON 오류는 지금과 같은 ApiError로 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "report_exists", message: "이미 있습니다" }, { status: 409 })));
    await expect(apiStream("/x", {}, () => {})).rejects.toMatchObject({ status: 409, code: "report_exists", message: "이미 있습니다" });
    await expect(apiStream("/x", {}, () => {})).rejects.toBeInstanceOf(ApiError);
  });

  it("네트워크 오류는 연결 확인 문구의 ApiError다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fail"))));
    await expect(apiStream("/x", {}, () => {})).rejects.toMatchObject({ status: 0, code: "network" });
  });
});
