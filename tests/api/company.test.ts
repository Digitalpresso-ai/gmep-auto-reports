import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { objects } from "./fake-storage";
import { companyWithPassword, loginCookie, params, request, startDb, type TestDb } from "./harness";

vi.mock("@/server/storage", () => import("./fake-storage"));

let t: TestDb;
let a: { id: string; cookie: string };
let b: { id: string; cookie: string };
const date = "2026-11-02";

beforeAll(async () => {
  t = await startDb();
  const aId = await companyWithPassword(t.sql, "주식회사 디지털프레소", "a-password");
  const bId = await companyWithPassword(t.sql, "공존", "b-password");
  a = { id: aId, cookie: await loginCookie(aId, "a-password") };
  b = { id: bId, cookie: await loginCookie(bId, "b-password") };
  await t.sql`insert into shared_days (report_date, schedule_text) values (${date}, '09:30 온보딩')`;
  await t.sql`insert into shared_files (report_date, kind, storage_path, filename, width, height) values
    (${date}, 'photo', 'shared/2026-11-02/p1.jpg', 'p1.jpg', 1100, 825),
    (${date}, 'schedule_image', 'shared/2026-11-02/s1.jpg', 's1.jpg', 1600, 1200)`;
  await t.sql`insert into shared_materials (report_date, kind, filename, text_content) values (${date}, 'education', '강의.pdf', '시장 진입 전략')`;
});
afterAll(() => t?.stop());

const day = async (cookie: string, d = date) => (await import("@/app/api/days/[date]/route")).GET(request("GET", "/x", { cookie }), params({ date: d }));
const saveDraft = async (cookie: string, body: unknown, d = date) =>
  (await import("@/app/api/days/[date]/draft/route")).PUT(request("PUT", "/x", { cookie, body }), params({ date: d }));
async function uploadPhoto(cookie: string) {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(8)], { type: "image/jpeg" }), "mine.jpg");
  form.set("width", "1100");
  form.set("height", "700");
  const { POST } = await import("@/app/api/days/[date]/photos/route");
  return POST(request("POST", "/x", { cookie, form }), params({ date }));
}

describe("AUTH-3 최초 비밀번호 변경 전 차단", () => {
  it("비밀번호를 바꾸기 전에는 회사 정보 API를 거부한다", async () => {
    const id = await companyWithPassword(t.sql, "지비오", "initial-pass", true);
    const cookie = await loginCookie(id, "initial-pass");
    const { PUT } = await import("@/app/api/company/route");
    const res = await PUT(request("PUT", "/api/company", { cookie, body: { traveler: "홍길동" } }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("password_change_required");
    expect((await day(cookie)).status).toBe(403);
  });
});

describe("FUNC-1 회사 정보", () => {
  it("출장자·회사 소개를 저장하고 로그인 정보에 불러온다", async () => {
    const { PUT } = await import("@/app/api/company/route");
    const res = await PUT(request("PUT", "/api/company", { cookie: a.cookie, body: { traveler: "송지웅(대표)", businessIntro: "건설 문서 자동화" } }));
    expect(res.status).toBe(200);
    const me = await (await (await import("@/app/api/me/route")).GET(request("GET", "/api/me", { cookie: a.cookie }))).json();
    expect(me.company).toMatchObject({ traveler: "송지웅(대표)", businessIntro: "건설 문서 자동화", label: "디지털프레소(주)" });
  });

  it("회사 소개 5,000자를 넘기면 거부한다", async () => {
    const { PUT } = await import("@/app/api/company/route");
    expect((await PUT(request("PUT", "/api/company", { cookie: a.cookie, body: { businessIntro: "가".repeat(5001) } }))).status).toBe(400);
  });

  it("본문에 다른 회사 id를 넣어도 세션의 회사만 바꾼다(AUTH-8)", async () => {
    const { PUT } = await import("@/app/api/company/route");
    await PUT(request("PUT", "/api/company", { cookie: a.cookie, body: { companyId: b.id, id: b.id, traveler: "침입" } }));
    const [row] = await t.sql`select traveler from companies where id = ${b.id}`;
    expect(row.traveler).toBe("");
  });

  it("기안문 추출 텍스트를 저장하고 '기안문 내용 보기'로 돌려준다", async () => {
    const route = await import("@/app/api/company/proposal/route");
    expect((await route.PUT(request("PUT", "/x", { cookie: a.cookie, body: { filename: "기안.pdf", text: "출장 계획 11/2 베를린" } }))).status).toBe(200);
    expect(await (await route.GET(request("GET", "/x", { cookie: a.cookie }))).json()).toEqual({ filename: "기안.pdf", text: "출장 계획 11/2 베를린" });
    expect(await (await route.GET(request("GET", "/x", { cookie: b.cookie }))).json()).toEqual({ filename: null, text: "" });
    expect((await route.PUT(request("PUT", "/x", { cookie: a.cookie, body: { filename: "빈.pdf", text: " " } }))).status).toBe(400);
  });
});

describe("DATA-3 보관 기한 안내", () => {
  it("로그인 전에도 종료일과 보관 기한을 알려 준다", async () => {
    const { GET } = await import("@/app/api/notice/route");
    expect(await (await GET()).json()).toEqual({ programEndDate: "2026-11-30", retentionUntil: "2026-12-30" });
    await t.sql`insert into app_settings (key, value) values ('program_end_date', '"2026-12-15"')`;
    expect(await (await GET()).json()).toEqual({ programEndDate: "2026-12-15", retentionUntil: "2027-01-15" });
    await t.sql`delete from app_settings where key = 'program_end_date'`;
  });
});

describe("SHARED-2·3 작성 화면 데이터", () => {
  it("공통 자료가 있는 날은 공통 일정 복사본·공통 사진·교육자료 목록을 준다", async () => {
    const body = await (await day(a.cookie)).json();
    expect(body.hasShared).toBe(true);
    expect(body.schedule).toEqual({ text: "09:30 온보딩", edited: false });
    expect(body.photos).toEqual([expect.objectContaining({ source: "shared", filename: "p1.jpg", url: expect.stringContaining("signed") })]);
    expect(body.scheduleImages).toHaveLength(1);
    expect(body.materials).toEqual([{ id: expect.any(String), kind: "education", filename: "강의.pdf", chars: 8, hasOriginal: false }]);
    expect(body.usage).toEqual({ generateUsed: 0, generateLimit: 5, generateRemaining: 5, reviseUsed: 0, reviseLimit: 15, reviseRemaining: 15, tokenLimitReached: false });
    expect(body.report).toBeNull();
  });

  it("공통 자료가 없는 날도 빈 입력으로 연다(SHARED-4)", async () => {
    const body = await (await day(a.cookie, "2026-11-05")).json();
    expect(body).toMatchObject({ hasShared: false, draftSaved: false, schedule: { text: "", edited: false }, photos: [], materials: [] });
  });

  it("회사가 고친 일정 복사본은 이후 공통 일정이 바뀌어도 유지하고, 다른 회사에는 영향이 없다", async () => {
    expect((await saveDraft(a.cookie, { scheduleText: "09:30 온보딩(A사 메모)" })).status).toBe(200);
    await t.sql`update shared_days set schedule_text = '09:00 변경된 공통 일정' where report_date = ${date}`;
    expect((await (await day(a.cookie)).json()).schedule).toEqual({ text: "09:30 온보딩(A사 메모)", edited: true });
    expect((await (await day(b.cookie)).json()).schedule).toEqual({ text: "09:00 변경된 공통 일정", edited: false });
  });
});

describe("FUNC-17 입력 초안 자동 저장", () => {
  it("사진 선택 순서와 특이사항을 저장하고 다시 열면 복원한다", async () => {
    const shared = (await (await day(a.cookie)).json()).photos[0];
    const res = await saveDraft(a.cookie, { selectedPhotos: [{ source: "shared", id: shared.id }], notes: "CTO 미팅" });
    expect(res.status).toBe(200);
    const body = await (await day(a.cookie)).json();
    expect(body.selectedPhotos).toEqual([{ source: "shared", id: shared.id }]);
    expect(body.notes).toBe("CTO 미팅");
    expect(body.draftSaved).toBe(true);
    expect(body.schedule.edited).toBe(true);
  });

  it("없는 사진이나 다른 날짜의 공통 사진은 고를 수 없다", async () => {
    const res = await saveDraft(a.cookie, { selectedPhotos: [{ source: "shared", id: "00000000-0000-0000-0000-000000000000" }] });
    expect(res.status).toBe(400);
    const shared = (await (await day(a.cookie)).json()).photos[0];
    expect((await saveDraft(a.cookie, { selectedPhotos: [{ source: "shared", id: shared.id }] }, "2026-11-03")).status).toBe(400);
  });

  it("사진 장수에 제한 없이 그날 사진을 모두 고를 수 있다", async () => {
    const many = "2026-11-06";
    await t.sql`insert into shared_days (report_date) values (${many})`;
    const rows = await t.sql<{ id: string }[]>`insert into shared_files (report_date, kind, storage_path, filename, width, height)
      select ${many}, 'photo', 'shared/2026-11-06/p' || n || '.jpg', 'p' || n || '.jpg', 1100, 825 from generate_series(1, 40) n returning id`;
    const refs = rows.map((r) => ({ source: "shared", id: r.id }));
    expect((await saveDraft(a.cookie, { selectedPhotos: refs }, many)).status).toBe(200);
    expect((await (await day(a.cookie, many)).json()).selectedPhotos).toHaveLength(40);
  });

  it("관리자가 지운 공통 사진은 선택에서 빼고 돌려줘 그대로 다시 저장할 수 있다", async () => {
    const [gone] = await t.sql`insert into shared_files (report_date, kind, storage_path, filename, width, height)
      values (${date}, 'photo', 'shared/2026-11-02/gone.jpg', 'gone.jpg', 1100, 825) returning id`;
    const kept = (await (await day(a.cookie)).json()).photos[0];
    const both = [{ source: "shared", id: kept.id }, { source: "shared", id: gone.id }];
    expect((await saveDraft(a.cookie, { selectedPhotos: both })).status).toBe(200);
    await t.sql`delete from shared_files where id = ${gone.id}`;
    const body = await (await day(a.cookie)).json();
    expect(body.selectedPhotos).toEqual([{ source: "shared", id: kept.id }]);
    expect((await saveDraft(a.cookie, { selectedPhotos: body.selectedPhotos })).status).toBe(200);
  });
});

describe("SHARED-3·AUTH-8 회사가 추가한 사진", () => {
  it("회사 폴더에 저장하고 그 회사에만 보인다", async () => {
    const res = await uploadPhoto(a.cookie);
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const [row] = await t.sql`select storage_path from company_photos where id = ${id}`;
    expect(row.storage_path.startsWith(`companies/${a.id}/${date}/`)).toBe(true);
    expect(objects.has(row.storage_path)).toBe(true);
    const aPhotos = (await (await day(a.cookie)).json()).photos;
    const bPhotos = (await (await day(b.cookie)).json()).photos;
    expect(aPhotos.map((p: { id: string }) => p.id)).toContain(id);
    expect(bPhotos.map((p: { id: string }) => p.id)).not.toContain(id);
  });

  it("다른 회사 사진 id를 넣은 선택·삭제를 거부한다", async () => {
    const [row] = await t.sql`select id from company_photos where company_id = ${a.id}`;
    expect((await saveDraft(b.cookie, { selectedPhotos: [{ source: "company", id: row.id }] })).status).toBe(400);
    const { DELETE } = await import("@/app/api/days/[date]/photos/[id]/route");
    expect((await DELETE(request("DELETE", "/x", { cookie: b.cookie }), params({ date, id: row.id }))).status).toBe(404);
    expect((await t.sql`select 1 from company_photos where id = ${row.id}`).length).toBe(1);
  });

  it("자기 사진은 지우고 선택에서도 뺀다", async () => {
    const [row] = await t.sql`select id from company_photos where company_id = ${a.id}`;
    await saveDraft(a.cookie, { selectedPhotos: [{ source: "company", id: row.id }] });
    const { DELETE } = await import("@/app/api/days/[date]/photos/[id]/route");
    expect((await DELETE(request("DELETE", "/x", { cookie: a.cookie }), params({ date, id: row.id }))).status).toBe(200);
    expect((await (await day(a.cookie)).json()).selectedPhotos).toEqual([]);
  });
});

describe("AUTH-8 세션 없는 호출", () => {
  it("모든 회사 API가 401이다", async () => {
    expect((await day("")).status).toBe(401);
    expect((await saveDraft("", {})).status).toBe(401);
    expect((await uploadPhoto("")).status).toBe(401);
  });
});

describe("FUNC-1 기안문 원본 보관", () => {
  const route = () => import("@/app/api/company/proposal/route");
  const uploadUrl = async (cookie: string, body: unknown) =>
    (await import("@/app/api/company/proposal/upload-url/route")).POST(request("POST", "/x", { cookie, body }));
  const file = async (cookie: string) => (await import("@/app/api/company/proposal/file/route")).GET(request("GET", "/x", { cookie }));

  it("자기 회사 폴더의 서명 업로드 URL을 준다. 지원하지 않는 형식·너무 큰 파일은 거부한다", async () => {
    const res = await uploadUrl(a.cookie, { filename: "기안.pdf", size: 1000 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.storagePath).toMatch(new RegExp(`^companies/${a.id}/proposal/[0-9a-f-]+\\.pdf$`));
    expect(body.uploadUrl).toContain(body.storagePath);
    expect((await uploadUrl(a.cookie, { filename: "x.exe", size: 10 })).status).toBe(400);
    expect((await uploadUrl(a.cookie, { filename: "big.pdf", size: 60 * 1024 * 1024 })).status).toBe(400);
  });

  it("원본 경로와 함께 저장하고, 자기 회사만 서명 URL로 내려받는다(AUTH-8)", async () => {
    const { storagePath } = await (await uploadUrl(a.cookie, { filename: "기안.pdf", size: 1000 })).json();
    objects.set(storagePath, { bytes: new Uint8Array([1]), contentType: "application/pdf" });
    const r = await route();
    expect((await r.PUT(request("PUT", "/x", { cookie: a.cookie, body: { filename: "기안.pdf", text: "계획", storagePath } }))).status).toBe(200);
    const dl = await file(a.cookie);
    expect(dl.status).toBe(200);
    expect((await dl.json()).url).toContain(storagePath);
    expect((await file(b.cookie)).status).toBe(404);
  });

  it("다른 회사 폴더 경로는 저장하지 않는다", async () => {
    const r = await route();
    const res = await r.PUT(request("PUT", "/x", { cookie: b.cookie, body: { filename: "기안.pdf", text: "계획", storagePath: `companies/${a.id}/proposal/x.pdf` } }));
    expect(res.status).toBe(400);
  });

  it("교체하거나 지우면 이전 원본도 지운다", async () => {
    const [before] = await t.sql`select proposal_storage_path from companies where id = ${a.id}`;
    const { storagePath } = await (await uploadUrl(a.cookie, { filename: "기안2.docx", size: 1000 })).json();
    objects.set(storagePath, { bytes: new Uint8Array([2]), contentType: "application/octet-stream" });
    const r = await route();
    await r.PUT(request("PUT", "/x", { cookie: a.cookie, body: { filename: "기안2.docx", text: "새 계획", storagePath } }));
    expect(objects.has(before.proposal_storage_path)).toBe(false);
    expect(objects.has(storagePath)).toBe(true);
    expect((await r.DELETE(request("DELETE", "/x", { cookie: a.cookie }))).status).toBe(200);
    expect(objects.has(storagePath)).toBe(false);
    expect((await file(a.cookie)).status).toBe(404);
  });
});
