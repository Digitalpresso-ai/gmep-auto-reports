import "server-only";
import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

export function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ code, message, ...extra }, { status });
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function setSessionCookie(res: NextResponse, name: string, token: string, maxAgeSeconds: number): NextResponse {
  res.cookies.set(name, token, {
    httpOnly: true,
    // 로컬 http 개발에서는 Safari가 Secure 쿠키를 저장하지 않는다
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
  return res;
}

export function clearCookie(res: NextResponse, name: string): NextResponse {
  res.cookies.set(name, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export const badRequest = (message: string) => fail(400, "bad_request", message);
export const notFound = () => fail(404, "not_found", "찾을 수 없습니다");
