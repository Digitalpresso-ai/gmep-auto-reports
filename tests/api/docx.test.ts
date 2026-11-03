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

const download = async (cookie: string, d = date) => (await import("@/app/api/days/[date]/report/docx/route")).GET(request("GET", "/x", { cookie }), params({ date: d }));

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

describe("PHOTO-2 Word 사진 배치", () => {
  const d = "2026-11-03";
  const docXml = async () => JSZip.loadAsync(await (await download(a.cookie, d)).arrayBuffer()).then((z) => z.file("word/document.xml")!.async("string"));

  beforeAll(async () => {
    await t.sql`insert into shared_days (report_date) values (${d})`;
    const ids: string[] = [];
    for (const n of [1, 2, 3]) {
      const [p] = await t.sql<{ id: string }[]>`insert into shared_files (report_date, kind, storage_path, filename, width, height)
        values (${d}, 'photo', ${`shared/${d}/p${n}.jpg`}, ${`p${n}.jpg`}, 1100, 825) returning id`;
      objects.set(`shared/${d}/p${n}.jpg`, { bytes: new Uint8Array(JPEG), contentType: "image/jpeg" });
      ids.push(p.id);
    }
    await t.sql`insert into drafts (company_id, report_date, selected_photos) values (${a.id}, ${d}, ${t.sql.json(ids.slice(0, 2).map((id) => ({ source: "shared", id })))})`;
    // 사진 3은 AI가 배치했지만 회사가 선택에서 뺐다
    const html =
      `<h1>보고서</h1><h2>1. 세부 교육 내용</h2><h3>강연</h3><ul><li>강연 요약</li></ul><div class="photos" data-photos="shared:${ids[1]} shared:${ids[0]} shared:${ids[2]}"></div>` +
      '<h2>2. 시사점</h2><ul><li>시사점 요약</li></ul><h2>3. 참여 사진</h2><div class="photos"></div><h2>붙임</h2><ul><li>강연 자료</li></ul>';
    await t.sql`insert into reports (company_id, report_date, title, body_html) values (${a.id}, ${d}, '보고서', ${html})`;
  });

  it("AI가 둔 자리에 고른 사진만 넣고, 모두 본문에 들어가면 참여 사진 제목을 뺀다", async () => {
    const doc = await docXml();
    const drawings = [...doc.matchAll(/<w:drawing>/g)].map((m) => m.index!);
    expect(drawings).toHaveLength(2);
    expect(doc.indexOf("강연 요약")).toBeLessThan(drawings[0]);
    expect(drawings[1]).toBeLessThan(doc.indexOf("시사점 요약"));
    expect(doc).not.toContain("참여 사진");
    expect(doc).toContain("붙임");
  });

  it("고른 사진 중 자리에 없는 사진은 참여 사진 칸에 넣는다", async () => {
    const [p4] = await t.sql<{ id: string }[]>`insert into shared_files (report_date, kind, storage_path, filename, width, height)
      values (${d}, 'photo', ${`shared/${d}/p1.jpg`}, 'p4.jpg', 825, 1100) returning id`;
    await t.sql`update drafts set selected_photos = selected_photos || ${t.sql.json([{ source: "shared", id: p4.id }])} where company_id = ${a.id} and report_date = ${d}`;
    const doc = await docXml();
    const drawings = [...doc.matchAll(/<w:drawing>/g)].map((m) => m.index!);
    expect(drawings).toHaveLength(3);
    expect(doc.indexOf("참여 사진")).toBeGreaterThan(doc.indexOf("시사점 요약"));
    expect(drawings[2]).toBeGreaterThan(doc.indexOf("참여 사진"));
    expect(drawings[2]).toBeLessThan(doc.indexOf("붙임"));
  });
});
