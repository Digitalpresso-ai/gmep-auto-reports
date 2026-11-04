// 브라우저에서 자체 서버 API만 부른다. src/server는 import하지 않는다.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body: Record<string, unknown> = {}) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body !== undefined || init.form ? "POST" : "GET"),
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "인터넷 연결을 확인한 뒤 다시 시도해 주세요");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.code ?? "error", data.message ?? "요청을 처리하지 못했습니다", data);
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "요청을 처리하지 못했습니다");

export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export function fmtDate(d: string): string {
  const t = new Date(`${d}T00:00:00`);
  return Number.isNaN(t.getTime()) ? d : `${t.getMonth() + 1}. ${t.getDate()}.(${WEEK[t.getDay()]})`;
}

/**
 * NDJSON 스트림 응답을 한 줄씩 넘긴다(보고서 생성). 스트림을 열기 전의 오류(409·429 등)는 서버가 JSON으로 주므로 api()와 같은 ApiError로 던진다.
 * 끝까지 읽으면 돌아온다. 중간에 연결이 끊기면 network ApiError다.
 */
export async function apiStream(path: string, body: unknown, onLine: (line: Record<string, unknown>) => void): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "인터넷 연결을 확인한 뒤 다시 시도해 주세요");
  }
  if (!res.ok || (res.headers.get("content-type") ?? "").includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.code ?? "error", data.message ?? "요청을 처리하지 못했습니다", data);
  }
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const flush = (final: boolean) => {
    const lines = buf.split("\n");
    buf = final ? "" : (lines.pop() ?? "");
    for (const l of lines) if (l.trim()) onLine(JSON.parse(l));
  };
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      throw new ApiError(0, "network", "연결이 끊겼습니다. 보고서는 서버에서 계속 만들어지니 잠시 뒤 다시 열어 주세요");
    }
    if (chunk.done) break;
    buf += decoder.decode(chunk.value, { stream: true });
    flush(false);
  }
  buf += decoder.decode();
  flush(true);
}
