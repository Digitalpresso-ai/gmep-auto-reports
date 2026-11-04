import { describe, expect, it } from "vitest";
import { assignPhotos, parsePhotoKeys } from "@/lib/photo-layout";
import { applyOp, headingsOf, parseBlocks, renderDoc, type BlockDoc } from "@/server/domain/blocks";
import { normalizeReport, renderReportHtml } from "@/server/domain/report";
import { GMEP_DAILY, missingSections, withRestPhotos, type ReportTemplate } from "@/server/domain/template";

const k1 = "shared:0b6f3c1e-1d2a-4c3b-9e8f-112233445566";
const k2 = "company:1c7f4d2f-2e3b-4d4c-8f9a-223344556677";

const fullReport = () =>
  renderReportHtml(
    normalizeReport({
      title: "GMEP 일일 출장보고서",
      basic: [["일자", "2026. 11. 2.(월)"]],
      schedule: [["09:30", "온보딩", "참석"]],
      education: [{ title: "3-1. 세션", items: [{ t: "a", sub: [] }], table: null }],
      achievements: [{ t: "성과", sub: [] }],
      special: [{ t: "미팅", sub: [] }],
      insights: [{ t: "시사점", sub: [] }],
      plans: ["계획"],
      attachments: ["자료"],
      photos: [],
    }),
  );

const strip = (s: string) => s.replace(/^\s*\d+(?:[.-]\d+)*\.?\s*/, "").replace(/\s+/g, "");

/** 사진 자리 블록의 data-photos 목록(assignPhotos 입력과 같은 모양). */
const boxesOf = (doc: BlockDoc) =>
  [...renderDoc(doc).matchAll(/<div class="photos"(?: data-photos="([^"]*)")?><\/div>/g)].map((m) => parsePhotoKeys(m[1]));

describe("기본 양식 GMEP_DAILY", () => {
  it("섹션 구성·순서가 renderReportHtml의 h2와 같다", () => {
    const h2 = headingsOf(parseBlocks(fullReport())).filter((h) => h.level === 2).map((h) => strip(h.text));
    expect(GMEP_DAILY.sections.map((s) => strip(s.heading))).toEqual(h2);
    expect(GMEP_DAILY.restPhotosSection).toBe("참여 사진");
    expect(GMEP_DAILY.sections.find((s) => s.heading === "붙임")?.numbered).toBe(false);
  });

  it("섹션 지침은 섹션별 규칙만 담고 공통 규칙(개조식·사실만)은 담지 않는다", () => {
    for (const s of GMEP_DAILY.sections.filter((x) => x.heading !== GMEP_DAILY.restPhotosSection)) expect(s.guidance.length, s.heading).toBeGreaterThan(0);
    const all = GMEP_DAILY.sections.flatMap((s) => s.guidance).join("\n");
    expect(all).not.toMatch(/개조식|서술형 어미|80자 이내/);
    expect(all).toContain("계획대로 이행");
    expect(GMEP_DAILY.titleGuidance).toContain("GMEP 일일 출장보고서");
  });
});

describe("missingSections", () => {
  it("renderReportHtml이 만든 전체 보고서에는 빠진 섹션이 없다", () => {
    expect(missingSections(GMEP_DAILY, parseBlocks(fullReport()))).toEqual([]);
  });

  it("필수 섹션 h2가 없으면 그 heading을 돌려주고, 번호·공백 차이와 선택 섹션은 무시한다", () => {
    const doc = parseBlocks("<h1>t</h1><h2>1.  기본 정보</h2><h2>2. 일정 및  수행 내용</h2><h3>주요 성과</h3><p>시사점 및 향후 계획</p>");
    expect(missingSections(GMEP_DAILY, doc)).toEqual(["주요 성과", "시사점 및 향후 계획"]);
  });
});

const WEEKLY: ReportTemplate = {
  id: "weekly",
  name: "주간 현장 보고",
  titleGuidance: "주간 현장 보고 — 주차",
  restPhotosSection: "현장 사진",
  sections: [
    { heading: "개요", required: true, numbered: true, guidance: ["주차와 현장명"] },
    { heading: "진행 상황", required: true, numbered: true, guidance: ["공정별 진행률 표"] },
    { heading: "현장 사진", required: false, numbered: true, guidance: [] },
    { heading: "이슈", required: true, numbered: false, guidance: ["미해결 이슈만"] },
  ],
};

describe("다른 양식에서도 같은 코드가 동작한다", () => {
  it("missingSections가 양식의 필수 섹션을 따른다", () => {
    const doc = parseBlocks("<h1>주간</h1><h2>1. 개요</h2><p>a</p><h2>기본 정보</h2>");
    expect(missingSections(WEEKLY, doc)).toEqual(["진행 상황", "이슈"]);
    expect(missingSections(WEEKLY, parseBlocks("<h2>1. 개요</h2><h2>2. 진행 상황</h2><h2>이슈</h2>"))).toEqual([]);
  });

  it("나머지 사진 자리가 없으면 양식 순서에 맞는 자리에 번호 붙은 제목과 키 없는 사진 자리를 넣는다", () => {
    const html = `<h2>1. 개요</h2><div class="photos" data-photos="${k1}"></div><h2>2. 진행 상황</h2><p>x</p><h2>이슈</h2><p>y</p>`;
    const doc = withRestPhotos(WEEKLY, parseBlocks(html));
    expect(renderDoc(doc)).toBe(`<h2>1. 개요</h2><div class="photos" data-photos="${k1}"></div><h2>2. 진행 상황</h2><p>x</p><h2>3. 현장 사진</h2><div class="photos"></div><h2>이슈</h2><p>y</p>`);
    expect(new Set(doc.blocks.map((b) => b.id)).size).toBe(doc.blocks.length);
    // 자리에 적힌 사진은 그 자리에, 나머지는 키 없는 마지막 자리에 들어간다
    expect(assignPhotos(boxesOf(doc), [k1, k2])).toEqual([[k1], [k2]]);
  });
});

describe("withRestPhotos (기본 양식)", () => {
  it("이미 키 없는 사진 자리가 있으면 그대로 둔다", () => {
    const doc = parseBlocks(fullReport());
    expect(withRestPhotos(GMEP_DAILY, doc)).toEqual(doc);
  });

  it("모델이 사진 자리를 지웠으면 참여 사진 제목 바로 뒤에 다시 넣는다", () => {
    let doc = parseBlocks(fullReport());
    const box = doc.blocks.findIndex((b) => b.html === '<div class="photos"></div>');
    const r = applyOp(doc, { name: "delete_block", input: { id: doc.blocks[box].id } }, []);
    if (!r.ok) throw new Error(r.error);
    doc = withRestPhotos(GMEP_DAILY, r.doc);
    expect(renderDoc(doc)).toBe(fullReport());
  });

  it("제목도 없으면 붙임 앞에 번호를 이어 붙여 넣고, 붙임이 없으면 끝에 넣는다", () => {
    const withAttach = withRestPhotos(GMEP_DAILY, parseBlocks("<h1>t</h1><h2>1. 기본 정보</h2><h2>2. 주요 성과</h2><h2>붙임</h2><ul><li>a</li></ul>"));
    expect(renderDoc(withAttach)).toBe('<h1>t</h1><h2>1. 기본 정보</h2><h2>2. 주요 성과</h2><h2>3. 참여 사진</h2><div class="photos"></div><h2>붙임</h2><ul><li>a</li></ul>');
    const noAttach = withRestPhotos(GMEP_DAILY, parseBlocks("<h1>t</h1><h2>1. 기본 정보</h2>"));
    expect(renderDoc(noAttach)).toBe('<h1>t</h1><h2>1. 기본 정보</h2><h2>2. 참여 사진</h2><div class="photos"></div>');
  });

  it("양식에 나머지 사진 섹션이 없으면 아무것도 넣지 않는다", () => {
    const { restPhotosSection, ...rest } = WEEKLY;
    void restPhotosSection;
    const doc = parseBlocks("<h2>1. 개요</h2>");
    expect(withRestPhotos(rest, doc)).toEqual(doc);
  });
});
