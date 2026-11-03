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
