import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextResponse } from "next/server";
import { db } from "./db";
import { afterFailure, afterSuccess, isLocked, validateNewPassword, type LoginLockState } from "./domain/login-lock";
import { fail, isUuid, readCookie } from "./http";

export const COMPANY_COOKIE = "gmep_session";
export const ADMIN_COOKIE = "gmep_admin";
export const SESSION_DAYS = 14;
export const SESSION_SECONDS = SESSION_DAYS * 24 * 3600;
const BCRYPT_COST = 10;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

export type LoginResult =
  | { kind: "ok"; token: string; mustChangePassword: boolean }
  | { kind: "wrong"; remaining: number }
  | { kind: "locked"; lockedUntil: Date }
  | { kind: "no_password" };

export async function loginCompany(companyId: unknown, password: string, now = new Date()): Promise<LoginResult> {
  if (!isUuid(companyId)) return { kind: "wrong", remaining: 0 };
  const sql = db();
  const [company] = await sql<{ password_hash: string | null; must_change_password: boolean }[]>`
    select password_hash, must_change_password from companies where id = ${companyId}`;
  if (!company) return { kind: "wrong", remaining: 0 };
  if (!company.password_hash) return { kind: "no_password" };

  const [row] = await sql<{ failed_count: number; locked_until: Date | null }[]>`
    select failed_count, locked_until from login_attempts where company_id = ${companyId}`;
  const state: LoginLockState = { failedCount: row?.failed_count ?? 0, lockedUntil: row?.locked_until ?? null };
  if (isLocked(state, now)) return { kind: "locked", lockedUntil: state.lockedUntil! };

  if (!(await bcrypt.compare(password, company.password_hash))) {
    const next = afterFailure(state, now);
    await saveLock(companyId, next);
    if (next.lockedUntil) return { kind: "locked", lockedUntil: next.lockedUntil };
    return { kind: "wrong", remaining: 5 - next.failedCount };
  }
  await saveLock(companyId, afterSuccess());
  const token = newToken();
  await sql`insert into sessions (token_hash, company_id, expires_at)
            values (${hashToken(token)}, ${companyId}, ${new Date(now.getTime() + SESSION_SECONDS * 1000)})`;
  return { kind: "ok", token, mustChangePassword: company.must_change_password };
}

async function saveLock(companyId: string, s: LoginLockState) {
  await db()`insert into login_attempts (company_id, failed_count, locked_until) values (${companyId}, ${s.failedCount}, ${s.lockedUntil})
             on conflict (company_id) do update set failed_count = excluded.failed_count, locked_until = excluded.locked_until`;
}

export type CompanySession = { companyId: string; tokenHash: string; mustChangePassword: boolean };

export async function companySession(req: Request): Promise<CompanySession | null> {
  const token = readCookie(req, COMPANY_COOKIE);
  if (!token) return null;
  const [row] = await db()<{ company_id: string; must_change_password: boolean }[]>`
    select s.company_id, c.must_change_password from sessions s join companies c on c.id = s.company_id
    where s.token_hash = ${hashToken(token)} and s.expires_at > now()`;
  return row ? { companyId: row.company_id, tokenHash: hashToken(token), mustChangePassword: row.must_change_password } : null;
}

/**
 * 회사 API의 공통 입구. 회사 id는 언제나 세션에서만 가져온다(AUTH-8).
 * 최초 비밀번호를 바꾸기 전에는 비밀번호 변경·내 정보·로그아웃 외 모든 회사 API를 막는다(AUTH-3).
 */
export async function requireCompany(req: Request): Promise<CompanySession | NextResponse> {
  const s = await companySession(req);
  if (!s) return fail(401, "unauthenticated", "다시 로그인해 주세요");
  if (s.mustChangePassword) return fail(403, "password_change_required", "먼저 비밀번호를 바꿔 주세요");
  return s;
}

export async function logoutCompany(req: Request): Promise<void> {
  const token = readCookie(req, COMPANY_COOKIE);
  if (token) await db()`delete from sessions where token_hash = ${hashToken(token)}`;
}

export type PasswordChange = { ok: true } | { ok: false; message: string };

export async function changeCompanyPassword(s: CompanySession, current: string | undefined, next: string): Promise<PasswordChange> {
  const invalid = validateNewPassword(next);
  if (invalid) return { ok: false, message: invalid };
  const sql = db();
  const [c] = await sql<{ password_hash: string }[]>`select password_hash from companies where id = ${s.companyId}`;
  // 최초 변경은 방금 초기 비밀번호로 로그인했으므로 현재 비밀번호를 다시 묻지 않는다
  if (!s.mustChangePassword && !(current && (await bcrypt.compare(current, c.password_hash)))) {
    return { ok: false, message: "현재 비밀번호가 맞지 않습니다" };
  }
  if (await bcrypt.compare(next, c.password_hash)) return { ok: false, message: "지금 쓰는 비밀번호와 다른 비밀번호를 입력해 주세요" };
  const hash = await hashPassword(next);
  await sql.begin(async (tx) => {
    await tx`update companies set password_hash = ${hash}, must_change_password = false, updated_at = now() where id = ${s.companyId}`;
    // 다른 기기에 남아 있던 세션은 끊는다
    await tx`delete from sessions where company_id = ${s.companyId} and token_hash <> ${s.tokenHash}`;
  });
  return { ok: true };
}

// ---------- 관리자(AUTH-12) ----------

export type AdminLoginResult = { kind: "ok"; token: string } | { kind: "wrong" } | { kind: "locked"; lockedUntil: Date } | { kind: "not_configured" };

export async function loginAdmin(password: string, now = new Date()): Promise<AdminLoginResult> {
  const sql = db();
  const [a] = await sql<{ password_hash: string; failed_count: number; locked_until: Date | null }[]>`
    select password_hash, failed_count, locked_until from admins where id = 1`;
  if (!a) return { kind: "not_configured" };
  const state: LoginLockState = { failedCount: a.failed_count, lockedUntil: a.locked_until };
  if (isLocked(state, now)) return { kind: "locked", lockedUntil: state.lockedUntil! };
  if (!(await bcrypt.compare(password, a.password_hash))) {
    const next = afterFailure(state, now);
    await sql`update admins set failed_count = ${next.failedCount}, locked_until = ${next.lockedUntil} where id = 1`;
    return next.lockedUntil ? { kind: "locked", lockedUntil: next.lockedUntil } : { kind: "wrong" };
  }
  await sql`update admins set failed_count = 0, locked_until = null where id = 1`;
  const token = newToken();
  await sql`insert into admin_sessions (token_hash, expires_at) values (${hashToken(token)}, ${new Date(now.getTime() + SESSION_SECONDS * 1000)})`;
  return { kind: "ok", token };
}

export async function requireAdmin(req: Request): Promise<true | NextResponse> {
  const token = readCookie(req, ADMIN_COOKIE);
  if (token) {
    const [row] = await db()`select 1 from admin_sessions where token_hash = ${hashToken(token)} and expires_at > now()`;
    if (row) return true;
  }
  return fail(401, "unauthenticated", "관리자 로그인이 필요합니다");
}

export async function logoutAdmin(req: Request): Promise<void> {
  const token = readCookie(req, ADMIN_COOKIE);
  if (token) await db()`delete from admin_sessions where token_hash = ${hashToken(token)}`;
}

export async function setAdminPassword(password: string): Promise<void> {
  const hash = await hashPassword(password);
  await db()`insert into admins (id, password_hash) values (1, ${hash})
             on conflict (id) do update set password_hash = excluded.password_hash, failed_count = 0, locked_until = null, updated_at = now()`;
  await db()`delete from admin_sessions`;
}
