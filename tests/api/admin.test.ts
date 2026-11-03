import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { objects } from "./fake-storage";
import { companyWithPassword, cookieOf, loginCookie, params, request, startDb, type TestDb } from "./harness";

vi.mock("@/server/storage", () => import("./fake-storage"));

let t: TestDb;
let admin: string;

beforeAll(async () => {
  t = await startDb();
  await t.sql`insert into admins (id, password_hash) values (1, ${await bcrypt.hash("admin-secret", 4)})`;
  const { POST } = await import("@/app/api/admin/login/route");
  admin = cookieOf(await POST(request("POST", "/api/admin/login", { body: { password: "admin-secret" } })), "gmep_admin");
});
afterAll(() => t?.stop());

const jpeg = (n = 10) => new Blob([new Uint8Array(n).fill(0xff)], { type: "image/jpeg" });
function photoForm(kind: string, name = "a.jpg") {
  const f = new FormData();
  f.set("kind", kind);
  f.set("file", jpeg(), name);
  f.set("width", "1100");
  f.set("height", "825");
  return f;
}

describe("AUTH-12 관리자 로그인", () => {
  it("관리자 비밀번호가 틀리면 401, 관리자 쿠키 없이 관리자 API를 부르면 401이다", async () => {
    const { POST } = await import("@/app/api/admin/login/route");
    expect((await POST(request("POST", "/api/admin/login", { body: { password: "wrong" } }))).status).toBe(401);
    const { GET } = await import("@/app/api/admin/companies/route");
    expect((await GET(request("GET", "/api/admin/companies"))).status).toBe(401);
  });

  it("회사 세션 쿠키로는 관리자 API를 쓸 수 없다", async () => {
    const id = await companyWithPassword(t.sql, "공존", "company-pass");
    const cookie = await loginCookie(id, "company-pass");
    const { GET } = await import("@/app/api/admin/companies/route");
    expect((await GET(request("GET", "/api/admin/companies", { cookie: cookie.replace("gmep_session", "gmep_admin") }))).status).toBe(401);
    expect((await GET(request("GET", "/api/admin/companies", { cookie }))).status).toBe(401);
  });

  it("로그아웃 뒤에는 같은 관리자 쿠키를 거부한다", async () => {
    const { POST } = await import("@/app/api/admin/login/route");
    const c = cookieOf(await POST(request("POST", "/api/admin/login", { body: { password: "admin-secret" } })), "gmep_admin");
    const logout = await import("@/app/api/admin/logout/route");
    await logout.POST(request("POST", "/api/admin/logout", { cookie: c }));
    const { GET } = await import("@/app/api/admin/companies/route");
    expect((await GET(request("GET", "/api/admin/companies", { cookie: c }))).status).toBe(401);
  });
});

describe("AUTH-9 회사 추가·이름 수정·초기 비밀번호 발급", () => {
  it("회사를 추가하고 같은 이름은 거부한다", async () => {
    const { POST, GET } = await import("@/app/api/admin/companies/route");
    const res = await POST(request("POST", "/api/admin/companies", { cookie: admin, body: { name: "주식회사 새회사" } }));
    expect(res.status).toBe(201);
    expect((await POST(request("POST", "/api/admin/companies", { cookie: admin, body: { name: "주식회사 새회사" } }))).status).toBe(409);
    expect((await POST(request("POST", "/api/admin/companies", { cookie: admin, body: { name: "  " } }))).status).toBe(400);
    const list = await (await GET(request("GET", "/api/admin/companies", { cookie: admin }))).json();
    expect(list.find((c: { name: string }) => c.name === "주식회사 새회사")).toMatchObject({ label: "새회사(주)", hasPassword: false });
  });

  it("목록에는 보고서·기안문 내용이 없다(AUTH-10)", async () => {
    const { GET } = await import("@/app/api/admin/companies/route");
    const [row] = await (await GET(request("GET", "/api/admin/companies", { cookie: admin }))).json();
    expect(Object.keys(row).sort()).toEqual(["hasPassword", "id", "label", "lockedUntil", "mustChangePassword", "name"]);
  });

  it("이름을 고친다", async () => {
    const [c] = await t.sql`select id from companies where name = '주식회사 새회사'`;
    const { PATCH } = await import("@/app/api/admin/companies/[id]/route");
    expect((await PATCH(request("PATCH", "/x", { cookie: admin, body: { name: "주식회사 새회사2" } }), params({ id: c.id }))).status).toBe(200);
    const [after] = await t.sql`select name from companies where id = ${c.id}`;
    expect(after.name).toBe("주식회사 새회사2");
  });

  it("초기 비밀번호를 한 번 보여 주고, 그 비밀번호로 로그인하면 변경을 요구한다", async () => {
    const [c] = await t.sql`select id from companies where name = '주식회사 새회사2'`;
    const { POST } = await import("@/app/api/admin/companies/[id]/password/route");
    const res = await POST(request("POST", "/x", { cookie: admin }), params({ id: c.id }));
    const { password } = await res.json();
    expect(password).toMatch(/^[A-Za-z0-9]{10}$/);
    const login = await import("@/app/api/auth/login/route");
    const r = await login.POST(request("POST", "/api/auth/login", { body: { companyId: c.id, password } }));
    expect(await r.json()).toEqual({ mustChangePassword: true });
  });
});

describe("SHARED-1 날짜별 공통 자료 등록", () => {
  const date = "2026-11-02";

  it("일정 텍스트를 저장하고 목록에 날짜가 나온다", async () => {
    const { PUT, GET } = await import("@/app/api/admin/days/[date]/route");
    expect((await PUT(request("PUT", "/x", { cookie: admin, body: { scheduleText: "09:30 온보딩" } }), params({ date }))).status).toBe(200);
    const day = await (await GET(request("GET", "/x", { cookie: admin }), params({ date }))).json();
    expect(day.scheduleText).toBe("09:30 온보딩");
    const list = await import("@/app/api/admin/days/route");
    const days = await (await list.GET(request("GET", "/api/admin/days", { cookie: admin }))).json();
    expect(days[0]).toMatchObject({ date, hasSchedule: true, photos: 0, scheduleImages: 0, materials: 0 });
  });

  it("사진과 일정 이미지를 날짜 폴더에 올리고 서명 URL로 보여 준다", async () => {
    const { POST } = await import("@/app/api/admin/days/[date]/files/route");
    expect((await POST(request("POST", "/x", { cookie: admin, form: photoForm("photo") }), params({ date }))).status).toBe(201);
    expect((await POST(request("POST", "/x", { cookie: admin, form: photoForm("schedule_image", "일정.jpg") }), params({ date }))).status).toBe(201);
    expect((await POST(request("POST", "/x", { cookie: admin, form: photoForm("video") }), params({ date }))).status).toBe(400);
    const day = await (await (await import("@/app/api/admin/days/[date]/route")).GET(request("GET", "/x", { cookie: admin }), params({ date }))).json();
    expect(day.files.map((f: { kind: string }) => f.kind).sort()).toEqual(["photo", "schedule_image"]);
    expect(day.files[0].url).toMatch(/^https:\/\/storage\.test\/signed\/shared\/2026-11-02\//);
    expect([...objects.keys()].filter((k) => k.startsWith("shared/2026-11-02/"))).toHaveLength(2);
  });

  it("교육자료는 추출 텍스트만 저장한다", async () => {
    const { POST } = await import("@/app/api/admin/days/[date]/materials/route");
    const res = await POST(request("POST", "/x", { cookie: admin, body: { kind: "education", filename: "강의.pdf", text: "[p.1]\n시장 진입 전략" } }), params({ date }));
    expect(res.status).toBe(201);
    expect((await POST(request("POST", "/x", { cookie: admin, body: { kind: "education", filename: "빈.pdf", text: "  " } }), params({ date }))).status).toBe(400);
    const day = await (await (await import("@/app/api/admin/days/[date]/route")).GET(request("GET", "/x", { cookie: admin }), params({ date }))).json();
    expect(day.materials).toEqual([expect.objectContaining({ kind: "education", filename: "강의.pdf", chars: 14 })]);
  });

  it("공통 파일·텍스트를 지운다", async () => {
    const [f] = await t.sql`select id from shared_files where kind = 'photo'`;
    const [m] = await t.sql`select id from shared_materials`;
    const files = await import("@/app/api/admin/days/[date]/files/[id]/route");
    const mats = await import("@/app/api/admin/days/[date]/materials/[id]/route");
    expect((await files.DELETE(request("DELETE", "/x", { cookie: admin }), params({ date, id: f.id }))).status).toBe(200);
    expect((await mats.DELETE(request("DELETE", "/x", { cookie: admin }), params({ date, id: m.id }))).status).toBe(200);
    expect((await t.sql`select 1 from shared_files where id = ${f.id}`).length).toBe(0);
  });

  it("날짜 형식이 틀리면 400이다", async () => {
    const { PUT } = await import("@/app/api/admin/days/[date]/route");
    expect((await PUT(request("PUT", "/x", { cookie: admin, body: { scheduleText: "x" } }), params({ date: "2026-13-40" }))).status).toBe(400);
  });
});
