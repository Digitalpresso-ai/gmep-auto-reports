import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companyWithPassword, cookieOf, loginCookie, request, startDb, type TestDb } from "./harness";

let t: TestDb;
let companyA: string;
let companyB: string;

beforeAll(async () => {
  t = await startDb();
  companyA = await companyWithPassword(t.sql, "주식회사 디지털프레소", "initial-pass", true);
  companyB = await companyWithPassword(t.sql, "공존", "b-password");
});
afterAll(() => t?.stop());

const login = async (body: unknown) => (await import("@/app/api/auth/login/route")).POST(request("POST", "/api/auth/login", { body }));
const me = async (cookie?: string) => (await import("@/app/api/me/route")).GET(request("GET", "/api/me", { cookie }));
const changePassword = async (cookie: string, body: unknown) =>
  (await import("@/app/api/auth/password/route")).POST(request("POST", "/api/auth/password", { cookie, body }));

describe("AUTH-1·2 로그인 회사 목록", () => {
  it("관리자 항목 없이 법인 표기를 뒤로 보낸 가나다순으로 준다", async () => {
    const { GET } = await import("@/app/api/companies/route");
    const list: { id: string; label: string }[] = await (await GET()).json();
    expect(list).toHaveLength(19);
    expect(list[0].label).toBe("공존");
    expect(list.map((c) => c.label)).toContain("디지털프레소(주)");
    expect(Object.keys(list[0]).sort()).toEqual(["id", "label"]);
  });
});

describe("AUTH-3·7 최초 로그인과 세션", () => {
  it("초기 비밀번호로 로그인하면 httpOnly 14일 세션과 비밀번호 변경 요구를 준다", async () => {
    const res = await login({ companyId: companyA, password: "initial-pass" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mustChangePassword: true });
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("gmep_session="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Max-Age=1209600/);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("8자 미만·초기 비밀번호와 같은 새 비밀번호를 거부하고, 바꾼 뒤에는 변경 요구가 사라진다", async () => {
    const cookie = await loginCookie(companyA, "initial-pass");
    expect((await changePassword(cookie, { newPassword: "short" })).status).toBe(400);
    expect((await changePassword(cookie, { newPassword: "initial-pass" })).status).toBe(400);
    expect((await changePassword(cookie, { newPassword: "new-password-1" })).status).toBe(200);
    const body = await (await me(cookie)).json();
    expect(body.mustChangePassword).toBe(false);
    expect((await login({ companyId: companyA, password: "new-password-1" })).status).toBe(200);
    expect((await login({ companyId: companyA, password: "initial-pass" })).status).toBe(401);
  });

  it("세션 없이 /api/me를 부르면 401이다", async () => {
    expect((await me()).status).toBe(401);
    expect((await me("gmep_session=forged-token")).status).toBe(401);
  });

  it("로그아웃하면 같은 쿠키로 다시 들어올 수 없다", async () => {
    const cookie = await loginCookie(companyB, "b-password");
    const { POST } = await import("@/app/api/auth/logout/route");
    const res = await POST(request("POST", "/api/auth/logout", { cookie }));
    expect(cookieOf(res, "gmep_session")).toBe("gmep_session=");
    expect((await me(cookie)).status).toBe(401);
  });
});

describe("AUTH-4 비밀번호 저장", () => {
  it("DB에는 bcrypt 해시만 남는다", async () => {
    const [row] = await t.sql`select password_hash from companies where id = ${companyA}`;
    expect(row.password_hash).toMatch(/^\$2[aby]\$/);
    expect(row.password_hash).not.toContain("new-password-1");
  });
});

describe("AUTH-11 로그인 후 비밀번호 변경", () => {
  it("현재 비밀번호가 틀리면 거부하고 맞으면 바꾼다", async () => {
    const id = await companyWithPassword(t.sql, "코봇시스템", "robot-pass-1");
    const cookie = await loginCookie(id, "robot-pass-1");
    expect((await changePassword(cookie, { currentPassword: "wrong-pass", newPassword: "robot-pass-2" })).status).toBe(400);
    expect((await changePassword(cookie, { newPassword: "robot-pass-2" })).status).toBe(400);
    expect((await changePassword(cookie, { currentPassword: "robot-pass-1", newPassword: "robot-pass-2" })).status).toBe(200);
    expect((await login({ companyId: id, password: "robot-pass-2" })).status).toBe(200);
  });
});

describe("AUTH-5 연속 실패 잠금", () => {
  it("5회 연속 틀리면 맞는 비밀번호도 15분 동안 거부한다", async () => {
    const id = await companyWithPassword(t.sql, "지비오", "gbo-password");
    for (let i = 0; i < 4; i++) expect((await login({ companyId: id, password: "nope-nope" })).status).toBe(401);
    const fifth = await login({ companyId: id, password: "nope-nope" });
    expect(fifth.status).toBe(423);
    const locked = await login({ companyId: id, password: "gbo-password" });
    expect(locked.status).toBe(423);
    expect((await locked.json()).lockedUntil).toBeTruthy();
    await t.sql`update login_attempts set locked_until = now() - interval '1 second' where company_id = ${id}`;
    expect((await login({ companyId: id, password: "gbo-password" })).status).toBe(200);
  });

  it("초기 비밀번호가 없는 회사는 로그인할 수 없다", async () => {
    const [row] = await t.sql`select id from companies where name = '주식회사 긱토'`;
    const res = await login({ companyId: row.id, password: "anything-1" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("no_password");
  });

  it("없는 회사 id는 401이다", async () => {
    expect((await login({ companyId: "00000000-0000-0000-0000-000000000000", password: "x" })).status).toBe(401);
    expect((await login({ companyId: "not-a-uuid", password: "x" })).status).toBe(401);
  });
});
