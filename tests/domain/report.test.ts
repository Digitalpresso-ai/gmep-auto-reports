import { describe, expect, it } from "vitest";
import { EDU_LIMIT, PROPOSAL_LIMIT, buildPrompt, type PromptInput } from "@/server/domain/prompt";
import { normalizeReport, parseModelJson, renderReportHtml } from "@/server/domain/report";

const base: PromptInput = {
  companyName: "주식회사 디지털프레소",
  traveler: "송지웅(대표)",
  businessIntro: "건설 문서 자동화",
  date: "2026-11-02",
  proposalText: "출장 계획",
  scheduleText: "09:30 온보딩",
  scheduleMaterials: [],
  educationMaterials: [],
  notes: "",
  hasScheduleImages: false,
  photos: [],
};

describe("AI-4·FUNC-14 프롬프트", () => {
  it("프로토타입 작성 규칙과 SCHEMA를 그대로 담는다", () => {
    const p = buildPrompt(base);
    expect(p).toContain('모든 문장은 개조식. "~습니다/~했다/~함." 같은 서술형 어미 금지');
    expect(p).toContain("입력에 없는 사실(미팅 상대, 계약, 수치, 연사 발언)은 지어내지 말 것");
    expect(p).toContain("반드시 이 회사의 사업·제품 관점에서");
    expect(p).toContain('"achievements": [{"t":"성과 제목","sub":["세부"]}]');
    expect(p).toContain("- 회사명: 주식회사 디지털프레소");
    expect(p).toContain("[보고 일자] 2026-11-02");
    expect(p).toContain("[특이사항 — 별도 성과·미팅 등]\n(없음)");
    expect(p).toContain("[교육자료]\n(없음)");
  });

  it("일정 텍스트 뒤에 일정 파일 텍스트를 붙이고 교육자료 이름을 나열한다", () => {
    const p = buildPrompt({
      ...base,
      scheduleMaterials: [{ filename: "일정.pdf", text: "10:00 세션" }],
      educationMaterials: [{ filename: "강의.pdf", text: "시장 진입" }, { filename: "법률.pptx", text: "법인 설립" }],
    });
    expect(p).toContain("09:30 온보딩\n\n# 일정.pdf\n10:00 세션");
    expect(p).toContain("[교육자료 — 강의.pdf, 법률.pptx]\n# 강의.pdf\n시장 진입\n\n# 법률.pptx\n법인 설립");
  });

  it("교육자료 합계 45,000자, 기안문 15,000자에서 자른다(AI-8)", () => {
    const p = buildPrompt({
      ...base,
      proposalText: "기".repeat(PROPOSAL_LIMIT + 10),
      educationMaterials: [{ filename: "a.pdf", text: "교".repeat(EDU_LIMIT) }],
    });
    expect(p).toContain("기".repeat(PROPOSAL_LIMIT) + "\n\n[운영사");
    expect(p).not.toContain("기".repeat(PROPOSAL_LIMIT + 1));
    expect(p).toContain("\n…(이하 생략)");
  });

  it("일정이 비고 이미지가 있으면 첨부 이미지를 보라고 한다", () => {
    expect(buildPrompt({ ...base, scheduleText: "", hasScheduleImages: true })).toContain("[운영사 제공 그날 일정]\n(첨부 이미지 참조)");
    expect(buildPrompt({ ...base, scheduleText: "", hasScheduleImages: false })).toContain("[운영사 제공 그날 일정]\n(없음)");
  });
});

describe("PHOTO-2 사진 설명 전달", () => {
  it("선택 순서대로 사진 번호와 관리자가 만든 설명을 넣고, 설명이 없는 사진은 그렇게 적는다", () => {
    const p = buildPrompt({ ...base, photos: [{ description: "강연 슬라이드 'Doing Business in Germany' 앞 발표자" }, { description: "" }] });
    expect(p).toContain("[사진 1] 강연 슬라이드 'Doing Business in Germany' 앞 발표자\n[사진 2] (설명 없음)");
    expect(p).toContain('"photos"');
  });

  it("사진이 없으면 사진 목록을 (없음)으로 둔다", () => {
    expect(buildPrompt(base)).toContain("[참여 사진 — 번호·설명]\n(없음)");
  });
});

describe("AI-5 모델 응답 해석", () => {
  it("JSON 하나 또는 코드블록에 싸인 JSON을 읽는다", () => {
    expect(parseModelJson('{"title":"t"}')).toEqual({ title: "t" });
    expect(parseModelJson('```json\n{"title":"t"}\n```')).toEqual({ title: "t" });
    expect(parseModelJson('설명입니다\n{"title":"t"}\n끝')).toEqual({ title: "t" });
  });

  it("JSON이 아니면 null이다", () => {
    expect(parseModelJson("죄송합니다")).toBeNull();
    expect(parseModelJson('{"title":')).toBeNull();
    expect(parseModelJson("[1,2]")).toBeNull();
  });
});

describe("FUNC-8 보고서 HTML", () => {
  it("항목 순서대로 번호를 붙이고 빈 항목은 뺀다. 참여 사진 자리는 남긴다", () => {
    const html = renderReportHtml(
      normalizeReport({
        title: "GMEP 일일 출장보고서",
        basic: [["일자", "2026. 11. 2.(월)"], ["관련 기안", ""]],
        schedule: [["09:30", "온보딩", "참석 완료"]],
        achievements: [{ t: "거점 확보", sub: ["사무실 이용"] }],
        plans: ["후속 미팅 준비"],
      }),
    );
    expect(html).toContain("<h1>GMEP 일일 출장보고서</h1>");
    expect(html).toContain("<h2>1. 기본 정보</h2>");
    expect(html).not.toContain("관련 기안");
    expect(html).toContain("<h2>2. 일정 및 수행 내용</h2>");
    expect(html).toContain("<h2>3. 주요 성과</h2><ul><li><strong>거점 확보</strong><ul><li>사무실 이용</li></ul></li></ul>");
    expect(html).toContain("<h2>4. 시사점 및 향후 계획</h2><h3>향후 계획</h3><ul><li>후속 미팅 준비</li></ul>");
    expect(html).toContain('<h2>5. 참여 사진</h2><div class="photos"></div>');
    expect(html).not.toContain("붙임");
  });

  it("AI가 고른 자리 옆에 사진 자리를 두고, 참여 사진은 마지막 번호 항목·붙임은 번호 없이 맨 끝에 둔다", () => {
    const html = renderReportHtml(
      normalizeReport({
        title: "t",
        schedule: [["09:30", "온보딩", "참석"]],
        education: [{ title: "3-1. 강연", items: [{ t: "시장", sub: [] }] }, { title: "3-2. 워크숍", items: [{ t: "피치", sub: [] }] }],
        attachments: ["강연 자료"],
        photos: [{ no: 1, place: "edu:2" }, { no: 2, place: "schedule" }, { no: 3, place: "edu:2" }, { no: 4, place: "edu:9" }, { no: 9, place: "schedule" }],
      }),
      ["shared:a", "shared:b", "company:c", "shared:d"],
    );
    expect(html).toContain('</table><div class="photos" data-photos="shared:b"></div><h2>3. 세부 교육 내용</h2>');
    expect(html).toContain('<h3>3-2. 워크숍</h3><ul><li>피치</li></ul><div class="photos" data-photos="shared:a company:c"></div>');
    expect(html).toMatch(/<h2>4\. 참여 사진<\/h2><div class="photos"><\/div><h2>붙임<\/h2><ul><li>강연 자료<\/li><\/ul>$/);
  });

  it("모델이 낸 글자의 HTML을 이스케이프한다", () => {
    const html = renderReportHtml(normalizeReport({ title: '<img src=x onerror="alert(1)">' }));
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img");
  });
});
