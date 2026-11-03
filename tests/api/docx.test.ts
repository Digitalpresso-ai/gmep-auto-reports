import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { objects } from "./fake-storage";
import { companyWithPassword, loginCookie, params, request, startDb, type TestDb } from "./harness";

vi.mock("@/server/storage", () => import("./fake-storage"));

let t: TestDb;
let a: { id: string; cookie: string };
let b: { id: string; cookie: string };
const date = "2026-11-02";
// 1x1 JPEG
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

beforeAll(async () => {
  t = await startDb();
  const aId = await companyWithPassword(t.sql, "주식회사 디지털프레소", "a-password");
  const bId = await companyWithPassword(t.sql, "공존", "b-password");
  a = { id: aId, cookie: await loginCookie(aId, "a-password") };
  b = { id: bId, cookie: await loginCookie(bId, "b-password") };
  await t.sql`insert into shared_days (report_date) values (${date})`;
  const [p] = await t.sql`insert into shared_files (report_date, kind, storage_path, filename, width, height)
    values (${date}, 'photo', 'shared/2026-11-02/p1.jpg', 'p1.jpg', 1100, 825) returning id`;
  objects.set("shared/2026-11-02/p1.jpg", { bytes: new Uint8Array(JPEG), contentType: "image/jpeg" });
  await t.sql`insert into drafts (company_id, report_date, selected_photos) values (${aId}, ${date}, ${t.sql.json([{ source: "shared", id: p.id }])})`;
  const html =
    '<h1>GMEP 일일 출장보고서</h1><h2>1. 기본 정보</h2><table class="kv"><tr><td>일자</td><td>2026. 11. 2.(월)</td></tr></table>' +
    "<h2>2. 주요 성과</h2><ul><li><strong>현지 거점 확보</strong><ul><li>코워킹 이용</li></ul></li></ul>" +
    '<h2>3. 참여 사진</h2><div class="photos"></div>';
  await t.sql`insert into reports (company_id, report_date, title, body_html) values (${aId}, ${date}, 'GMEP 일일 출장보고서', ${html})`;
});
afterAll(() => t?.stop());

const download = async (cookie: string) => (await import("@/app/api/days/[date]/report/docx/route")).GET(request("GET", "/x", { cookie }), params({ date }));

describe("FUNC-11 Word 다운로드", () => {
  it("맑은 고딕·A4·□/- 불릿과 고른 사진을 넣은 .docx를 준다", async () => {
    const res = await download(a.cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(res.headers.get("content-disposition")).toContain("filename*=UTF-8''");
    expect(decodeURIComponent(res.headers.get("content-disposition")!)).toContain("GMEP_일일출장보고서_2026-11-02_디지털프레소(주).docx");
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toContain("현지 거점 확보");
    expect(doc).toContain("코워킹 이용");
    expect(doc).toContain('w:w="11906"'); // A4 너비(twip)
    const numbering = await zip.file("word/numbering.xml")!.async("string");
    expect(numbering).toContain('w:val="□"');
    expect(numbering).toContain('w:val="-"');
    expect(await zip.file("word/styles.xml")!.async("string")).toContain("맑은 고딕");
    expect(Object.keys(zip.files).filter((n) => n.startsWith("word/media/"))).toHaveLength(1);
  });

  it("다른 회사 보고서는 내려받을 수 없다(AUTH-8)", async () => {
    expect((await download(b.cookie)).status).toBe(404);
    expect((await download("")).status).toBe(401);
  });
});
