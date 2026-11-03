import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ModelRequest, ModelResult } from "@/server/ai";
import { objects } from "./fake-storage";
import { companyWithPassword, cookieOf, loginCookie, params, request, startDb, type TestDb } from "./harness";

vi.mock("@/server/storage", () => import("./fake-storage"));
const callModel = vi.fn<(r: ModelRequest) => Promise<ModelResult>>();
vi.mock("@/server/ai", () => ({ callModel: (r: ModelRequest) => callModel(r) }));

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

  it("비밀번호가 없는 회사에만 한 번에 발급하고 회사 이름과 함께 돌려준다", async () => {
    const before = await t.sql<{ id: string; name: string; password_hash: string | null }[]>`select id, name, password_hash from companies`;
    const without = before.filter((c) => !c.password_hash);
    expect(without.length).toBeGreaterThan(0);
    const { POST } = await import("@/app/api/admin/companies/passwords/route");
    expect((await POST(request("POST", "/x"))).status).toBe(401);
    const res = await POST(request("POST", "/x", { cookie: admin }));
    expect(res.status).toBe(200);
    const { issued } = await res.json();
    expect(issued.map((i: { id: string }) => i.id).sort()).toEqual(without.map((c) => c.id).sort());
    expect(issued[0]).toEqual({ id: expect.any(String), name: expect.any(String), label: expect.any(String), password: expect.stringMatching(/^[A-Za-z0-9]{10}$/) });

    const after = await t.sql<{ id: string; password_hash: string }[]>`select id, password_hash from companies`;
    for (const c of before.filter((c) => c.password_hash)) expect(after.find((a) => a.id === c.id)!.password_hash).toBe(c.password_hash);
    const login = await import("@/app/api/auth/login/route");
    const r = await login.POST(request("POST", "/api/auth/login", { body: { companyId: issued[0].id, password: issued[0].password } }));
    expect(await r.json()).toEqual({ mustChangePassword: true });

    expect(await (await POST(request("POST", "/x", { cookie: admin }))).json()).toEqual({ issued: [] });
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

describe("FUNC-5 교육자료 원본 보관", () => {
  const date = "2026-11-06";
  const uploadUrl = async (body: unknown, cookie = admin) =>
    (await import("@/app/api/admin/days/[date]/materials/upload-url/route")).POST(request("POST", "/x", { cookie, body }), params({ date }));
  const addMaterial = async (body: unknown) =>
    (await import("@/app/api/admin/days/[date]/materials/route")).POST(request("POST", "/x", { cookie: admin, body }), params({ date }));

  it("그 날짜 자료 폴더의 서명 업로드 URL을 관리자에게만 준다", async () => {
    const res = await uploadUrl({ filename: "강의.pptx", size: 30 * 1024 * 1024 });
    expect(res.status).toBe(200);
    expect((await res.json()).storagePath).toMatch(/^shared\/2026-11-06\/materials\/[0-9a-f-]+\.pptx$/);
    expect((await uploadUrl({ filename: "강의.pptx", size: 10 }, "")).status).toBe(401);
  });

  it("다른 날짜 폴더 경로는 거부하고, 맞는 경로는 텍스트와 함께 저장한다", async () => {
    expect((await addMaterial({ kind: "education", filename: "a.pdf", text: "내용", storagePath: "shared/2026-11-07/materials/00000000-0000-0000-0000-000000000000.pdf" })).status).toBe(400);
    const { storagePath } = await (await uploadUrl({ filename: "a.pdf", size: 100 })).json();
    objects.set(storagePath, { bytes: new Uint8Array([1]), contentType: "application/pdf" });
    expect((await addMaterial({ kind: "education", filename: "a.pdf", text: "내용", storagePath })).status).toBe(201);
    const day = await (await (await import("@/app/api/admin/days/[date]/route")).GET(request("GET", "/x", { cookie: admin }), params({ date }))).json();
    expect(day.materials[0]).toMatchObject({ filename: "a.pdf", hasOriginal: true });
  });

  it("로그인한 회사는 그날 교육자료 원본을 내려받고, 세션이 없으면 401이다", async () => {
    const [m] = await t.sql`select id, storage_path from shared_materials where report_date = ${date}`;
    const id = await companyWithPassword(t.sql, "주식회사 마이렌", "myren-pass");
    const cookie = await loginCookie(id, "myren-pass");
    const route = await import("@/app/api/days/[date]/materials/[id]/file/route");
    const res = await route.GET(request("GET", "/x", { cookie }), params({ date, id: m.id }));
    expect(res.status).toBe(200);
    expect((await res.json()).url).toContain(m.storage_path);
    expect((await route.GET(request("GET", "/x", { cookie }), params({ date: "2026-11-02", id: m.id }))).status).toBe(404);
    expect((await route.GET(request("GET", "/x"), params({ date, id: m.id }))).status).toBe(401);
    const view = await (await (await import("@/app/api/days/[date]/route")).GET(request("GET", "/x", { cookie }), params({ date }))).json();
    expect(view.materials[0]).toMatchObject({ id: m.id, hasOriginal: true });
  });

  it("관리자가 자료를 지우면 원본도 지운다", async () => {
    const [m] = await t.sql`select id, storage_path from shared_materials where report_date = ${date}`;
    const mats = await import("@/app/api/admin/days/[date]/materials/[id]/route");
    expect((await mats.DELETE(request("DELETE", "/x", { cookie: admin }), params({ date, id: m.id }))).status).toBe(200);
    expect(objects.has(m.storage_path)).toBe(false);
  });
});

describe("PHOTO-1 공통 사진 설명", () => {
  const date = "2026-11-09";
  const describeAll = async (cookie = admin) =>
    (await import("@/app/api/admin/days/[date]/files/describe/route")).POST(request("POST", "/x", { cookie }), params({ date }));
  const answer = (text: string): ModelResult => ({ text, inputTokens: 900, outputTokens: 80, model: "claude-sonnet-5-5", stopReason: "end_turn" });

  it("설명이 없는 공통 사진만 사진 이미지와 함께 AI에 보내 설명을 저장한다. 일정 이미지는 설명하지 않는다", async () => {
    const { POST } = await import("@/app/api/admin/days/[date]/files/route");
    for (const kind of ["photo", "photo", "schedule_image"]) await POST(request("POST", "/x", { cookie: admin, form: photoForm(kind) }), params({ date }));
    callModel.mockReset();
    callModel
      .mockResolvedValueOnce(answer(JSON.stringify({ scene: "강연장에서 발표 중인 장면", activity: "강연", visible_text: "Doing Business in Germany" })))
      .mockRejectedValueOnce(new Error("overloaded"));
    const res = await describeAll();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ described: 1, failed: 1, remaining: 1 });
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[0][0].images).toHaveLength(1);
    expect(callModel.mock.calls[0][0].jsonSchema).toBeDefined();
    const rows = await t.sql<{ kind: string; description: string | null }[]>`select kind, description from shared_files where report_date = ${date} order by kind, description nulls last`;
    expect(rows).toEqual([
      { kind: "photo", description: '[강연] 강연장에서 발표 중인 장면 화면 글자: "Doing Business in Germany"' },
      { kind: "photo", description: null },
      { kind: "schedule_image", description: null },
    ]);
  });

  it("실패해 남은 사진은 다시 부르면 그것만 설명한다", async () => {
    callModel.mockReset();
    callModel.mockResolvedValueOnce(answer(JSON.stringify({ scene: "단체 사진", activity: "단체사진", visible_text: "" })));
    expect(await (await describeAll()).json()).toEqual({ described: 1, failed: 0, remaining: 0 });
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it("관리자 쿠키가 없으면 401이다", async () => {
    expect((await describeAll("")).status).toBe(401);
  });
});
