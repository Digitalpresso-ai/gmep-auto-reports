import { describe, expect, it } from "vitest";
import { parseBlocks, photosHtml } from "@/server/domain/blocks";
import { checkBlock, finalChecks, planIssues } from "@/server/domain/observe";
import { GMEP_DAILY, type ReportTemplate } from "@/server/domain/template";

const ul = (...items: string[]) => `<ul>${items.map((t) => `<li>${t}</li>`).join("")}</ul>`;

describe("checkBlock", () => {
  it("명사·체언 종결이고 80자 이내인 항목은 통과한다", () => {
    expect(checkBlock(ul("온보딩 완료", "현지 파트너 확보 필요", "규제 요건 확인", "통계·사례 포함", "11. 3.(화) 피칭 대비"))).toEqual([]);
    expect(checkBlock("<p>캐나다·르완다 시장 다음 단계 논의</p><p>주요 시장: 캐나다</p><p>참가 기업 모임</p>")).toEqual([]);
    expect(checkBlock('<table class="kv"><tr><td>일자</td><td>2026. 11. 2.(월)</td></tr></table>')).toEqual([]);
  });

  // 실제 11/2 자료 평가(k1)에서 나온 오판: 참석자 칸의 직함 괄호, '임'으로 끝나는 외래어 명사
  it("괄호로 끝나는 이름·직함과 '임'으로 끝나는 외래어 명사는 서술형으로 보지 않는다", () => {
    expect(checkBlock('<table class="kv"><tr><td>참석자</td><td>홍길동(대표), 김철수(주임)</td></tr></table>')).toEqual([]);
    expect(checkBlock(ul("경쟁사·자사 경쟁 구분 프레임", "B2B 게임 시장", "리드 타임"))).toEqual([]);
  });

  // 독립 리뷰에서 재현한 오판: 괄호 없는 직함, 예외 명사로 끝나는 합성어
  it("괄호 없는 직함과 예외 명사로 끝나는 합성어도 서술형으로 보지 않는다", () => {
    expect(checkBlock(ul("담당: 김철수 주임", "이영희 선임", "서버 런타임", "운영 책임", "무책임"))).toEqual([]);
    for (const t of ["일정을 확인함", "수요가 있음"]) expect(checkBlock(ul(t)).join(), t).toContain("서술형");
  });

  // Codex 독립 리뷰(v3)에서 재현: 두 글자 '~함' 명사
  it("두 글자 '함' 명사는 통과시키고, 세 글자 이상 '~함'과 떨어진 '함'은 서술형으로 본다", () => {
    expect(checkBlock(ul("제품 결함", "담당자 직함", "교환한 명함", "통계 포함"))).toEqual([]);
    for (const t of ["일정을 확인함", "대응이 미흡함", "현지화를 검토해야 함"]) expect(checkBlock(ul(t)).join(), t).toContain("서술형");
  });

  // '임'으로 끝나는 외래어·직함(클레임, 프레임, 주임…)은 목록으로 다 막을 수 없어 기계 검사에서 뺀다. "~임" 종결은 프롬프트 규칙과 품질 채점이 맡는다.
  it("'임'으로 끝나는 낱말은 서술형으로 보지 않는다", () => {
    expect(checkBlock(ul("고객 클레임", "핵심 고객임", "신규 아이템 스킴"))).toEqual([]);
  });

  it("표 칸의 서술형 종결은 계속 위반으로 알린다", () => {
    expect(checkBlock('<table class="kv"><tr><td>계획 대비</td><td>계획대로 이행함</td></tr></table>').join()).toContain("서술형");
  });

  it("80자 이내 경계값은 통과하고 81자는 앞 20자를 보여 위반으로 알린다", () => {
    expect(checkBlock(ul("가".repeat(80)))).toEqual([]);
    const long = "가나다라마바사아자차카타파하거너더러머버" + "서".repeat(61);
    const issues = checkBlock(ul(long));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("81자");
    expect(issues[0]).toContain("가나다라마바사아자차카타파하거너더러머버");
    expect(issues[0]).not.toContain("서서");
  });

  // 사용자 결정(2026-11-04): 거의 틀리지 않는 어미만 기계로 잡는다. 오판은 고치는 턴을 늘리고, 놓친 것은 품질 채점이 본다.
  it("확실한 서술형 어미를 위반으로 알린다", () => {
    for (const t of [
      "교육에 참석했습니다", "파트너를 만났다", "사업을 검토한다", "일정이 변경된다", "수요가 있다", "재고가 없다", "핵심 과제이다", "추진하겠다",
      "규제를 확인함", "일정을 확인함.", "현지화를 검토해야 함", "교육에 참석했음", "수요가 있음", "재고 없음", "일정 확정됨",
    ]) {
      const issues = checkBlock(ul(t));
      expect(issues, t).toHaveLength(1);
      expect(issues[0], t).toContain("서술형");
    }
  });

  it("확실하지 않은 꼴(형용사 ~다, 그 밖의 ~음·~임, 두 글자 ~함)은 서술형으로 보지 않는다", () => {
    expect(checkBlock(ul("시장이 크다", "수요가 높다", "시장이 넓음", "자료 묶음", "고객 클레임", "제품 결함", "통계 불포함"))).toEqual([]);
  });

  it("빈 li·p·td를 위반으로 알린다", () => {
    expect(checkBlock(ul("확인", " ")).join()).toContain("빈 항목");
    expect(checkBlock("<p></p>").join()).toContain("빈 항목");
    expect(checkBlock("<table><tr><td>09:30</td><td></td></tr></table>").join()).toContain("빈 항목");
  });

  it("하위 목록이 있는 항목은 상위 문구와 하위 항목을 따로 본다", () => {
    const html = "<ul><li><strong>시장 이해 확대</strong><ul><li>근거: 구매 구조 설명</li><li>적용: 영업 방식을 바꿔야 함</li></ul></li></ul>";
    const issues = checkBlock(html);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("적용: 영업 방식");
  });

  it("제목·사진 자리는 검사하지 않는다", () => {
    expect(checkBlock("<h2>1. 기본 정보</h2>")).toEqual([]);
    expect(checkBlock(photosHtml(["shared:a"]))).toEqual([]);
  });
});

describe("planIssues", () => {
  it("양식의 필수 섹션을 모두 계획하면 문제가 없다(번호·공백 차이는 무시)", () => {
    const plan = GMEP_DAILY.sections.filter((s) => s.required).map((s, n) => ({ heading: `${n + 1}. ${s.heading}` }));
    expect(planIssues(GMEP_DAILY, plan)).toEqual([]);
  });

  it("계획에 없는 필수 섹션과 양식에 없는 섹션 이름을 알린다", () => {
    const issues = planIssues(GMEP_DAILY, [{ heading: "기본 정보" }, { heading: "일정 및 수행 내용" }, { heading: "주요 성과" }, { heading: "총평" }]);
    expect(issues.some((s) => s.includes("시사점 및 향후 계획") && s.includes("필수"))).toBe(true);
    expect(issues.some((s) => s.includes("총평") && s.includes("양식에 없는"))).toBe(true);
    expect(issues.some((s) => s.includes("세부 교육 내용"))).toBe(false);
  });
});

describe("finalChecks", () => {
  const tpl: ReportTemplate = {
    id: "t",
    name: "주간 보고",
    titleGuidance: "제목",
    sections: [
      { heading: "요약", required: true, numbered: true, guidance: [] },
      { heading: "다음 주 계획", required: true, numbered: true, guidance: [] },
    ],
  };

  it("문제없는 문서는 빈 배열이다", () => {
    const doc = parseBlocks(`<h1>주간 보고</h1><h2>1. 요약</h2>${ul("시장 조사 완료")}${photosHtml(["shared:a"])}<h2>2. 다음 주 계획</h2>${ul("파트너 미팅 준비")}${photosHtml(["company:b"])}`);
    expect(finalChecks(tpl, doc)).toEqual([]);
  });

  it("빠진 필수 섹션과 블록별 규칙 위반을 블록 id와 함께 알린다", () => {
    const doc = parseBlocks(`<h1>주간 보고</h1><h2>1. 요약</h2>${ul("시장 조사를 완료했습니다")}${photosHtml(["shared:a", "company:c"])}${photosHtml(["company:c"])}`);
    const issues = finalChecks(tpl, doc);
    expect(issues.some((s) => s.includes("다음 주 계획"))).toBe(true);
    expect(issues.some((s) => s.includes("사진"))).toBe(false);
    expect(issues.some((s) => s.includes("b3") && s.includes("서술형"))).toBe(true);
  });

  it("수정에서는 바뀐 블록만 검사하고 빠진 필수 섹션은 알리지 않는다", () => {
    const doc = parseBlocks("<p>회사가 쓴 문장을 확인함</p><p>새로 쓴 문장을 검토함</p>");
    const issues = finalChecks(GMEP_DAILY, doc, { changed: new Set(["b2"]) });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("[b2]");
  });

  it("규칙 위반이 10개를 넘으면 10개만 보이고 나머지 건수를 알린다", () => {
    const items = Array.from({ length: 13 }, (_, n) => `항목 ${n + 1} 확인함`);
    const doc = parseBlocks(`<h1>주간 보고</h1><h2>1. 요약</h2>${ul(...items)}<h2>2. 다음 주 계획</h2>${ul("준비")}`);
    const issues = finalChecks(tpl, doc);
    expect(issues.filter((s) => s.includes("[b3]"))).toHaveLength(10);
    expect(issues.some((s) => s.includes("3건"))).toBe(true);
  });
});
