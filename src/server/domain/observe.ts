// ReAct 루프의 Observe 단계: 블록 tool 결과·작성 계획·finish 때 기계로 판정할 수 있는 규칙 위반을 찾아 짧은 한국어 문구로 돌려준다.
// 문구는 tool_result로 모델에 그대로 가므로 모델이 어느 항목을 어떻게 고칠지 알 수 있게 쓴다.
// scripts/eval/checks.ts는 품질 판정을 judge(LLM)에 맡기고 분량·형식 수치만 내므로 길이·종결 판정이 없다. 여기 판정이 기준이다.
import { DomUtils, parseDocument } from "htmlparser2";
import type { BlockDoc } from "./blocks";
import { missingSections, type ReportTemplate } from "./template";

type Element = ReturnType<typeof DomUtils.findAll>[number];

export const ITEM_MAX = 80;
const SHOW = 20;
const FINAL_MAX = 10;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const head = (s: string) => {
  const chars = Array.from(s);
  return chars.length > SHOW ? chars.slice(0, SHOW).join("") + "…" : s;
};

/** li는 하위 목록(ul/ol)을 뺀 자기 문구만 본다. 하위 li는 따로 검사된다. */
function ownText(el: Element): string {
  return squash(
    el.children
      .filter((c) => !(c.type === "tag" && (c.name === "ul" || c.name === "ol")))
      .map((c) => DomUtils.textContent(c))
      .join(""),
  );
}

// 프롬프트 [추가 규칙]의 서술형: "~습니다/~했다/~함/~음/~임/~있음/~해야 함". ~다 종결은 "캐나다" 같은 고유명사와 겹치지 않게 어미만 고른다.
// "됨"은 규칙 문구에 없지만 "함"의 피동(진행됨)이라 같이 본다.
const DA_ENDING = /(니다|겠다|한다|된다|있다|없다|이다)$/;
/** "~했다/~만났다"처럼 ㅆ 받침 음절 뒤의 "다"(과거 종결). */
const pastDa = (w: string) => {
  const c = w.length >= 2 && w.endsWith("다") ? w.charCodeAt(w.length - 2) - 0xac00 : -1;
  return c >= 0 && c < 11172 && c % 28 === 20;
};
// "~임"은 규칙상 서술형이지만 클레임·프레임·주임처럼 '임'으로 끝나는 명사가 많아 목록으로 다 막을 수 없다. 오판은 고치는 턴을 늘리므로
// 기계 검사에서는 빼고 프롬프트 규칙과 품질 채점에 맡긴다(2026-11-04 실제 자료 평가·독립 리뷰).
const NOMINAL_ENDING = /(음|됨)$/;
// "~함" 종결은 "확인함·검토함·미흡함"처럼 세 글자 이상이거나 "해야 함"처럼 떨어져 쓴다. "결함·직함·명함·포함"처럼 두 글자 낱말은 명사로 본다.
// 목록으로 명사를 막으면 끝이 없어(독립 리뷰 v3) 음절 수로 가른다. 두 글자 형용사형("강함")은 놓치지만 품질 채점이 본다.
const narrativeHam = (w: string) => w.endsWith("함") && (w === "함" || Array.from(w).length >= 3);
// 음·함으로 끝나지만 명사인 낱말(세 글자 이상이거나 음으로 끝나는 것). 보고서에 흔히 나오는 것만 둔다.
const NOUNS = new Set(["포함", "다음", "처음", "마음", "모음", "녹음", "발음", "소음", "믿음", "이음", "걸음", "웃음"]);
// "첫걸음"처럼 예외 명사로 끝나는 합성어도 명사이므로 낱말 끝으로 비교한다.
const isNoun = (w: string) => [...NOUNS].some((n) => w.endsWith(n));

/** 마지막 낱말(끝의 문장부호를 뗀 것)이 서술형 어미로 끝나면 그 낱말을 돌려준다. */
function narrativeEnding(text: string): string | null {
  // "김철수(주임)"처럼 괄호로 끝나면 이름·직함·보충 표기다. 괄호 안 낱말을 어미로 읽으면 오판한다.
  if (/[)\]」』》〉]\s*$/.test(text)) return null;
  const last = text.replace(/[^\p{L}\p{N}]+$/u, "").split(/\s+/).pop() ?? "";
  if (!last) return null;
  if (DA_ENDING.test(last) || pastDa(last)) return last;
  if (narrativeHam(last) && !isNoun(last)) return last;
  if (NOMINAL_ENDING.test(last) && !isNoun(last)) return last;
  return null;
}

export function checkBlock(html: string): string[] {
  const items = DomUtils.findAll((el) => el.name === "li" || el.name === "p" || el.name === "td", parseDocument(html).children);
  const issues: string[] = [];
  for (const el of items) {
    const text = el.name === "li" ? ownText(el) : squash(DomUtils.textContent(el));
    if (!text) {
      // 하위 목록만 있는 li는 상위 문구가 빠진 것이므로 역시 빈 항목이다.
      issues.push(`빈 항목이 있습니다(${el.name}). 내용을 채우거나 항목을 지울 것.`);
      continue;
    }
    const len = Array.from(text).length;
    if (len > ITEM_MAX) issues.push(`${ITEM_MAX}자 초과(${len}자): "${head(text)}" — 한 항목에 한 내용만, 길면 하위 항목으로 나눌 것.`);
    const end = narrativeEnding(text);
    if (end) issues.push(`서술형 종결("${end}"): "${head(text)}" — 명사·체언으로 끝낼 것(예: "확인", "수립 필요").`);
  }
  return issues;
}

/** template.ts의 비교 규칙과 같다: 앞 번호와 공백을 무시한다. */
const norm = (s: string) => s.replace(/^\s*\d+(?:[.-]\d+)*\.?\s*/, "").replace(/\s+/g, "");

export function planIssues(t: ReportTemplate, sections: { heading: string }[]): string[] {
  const planned = new Set(sections.map((s) => norm(s.heading)));
  const known = new Set(t.sections.map((s) => norm(s.heading)));
  return [
    ...t.sections.filter((s) => s.required && !planned.has(norm(s.heading))).map((s) => `필수 섹션이 계획에 없습니다: ${s.heading}`),
    ...sections.filter((s) => !known.has(norm(s.heading))).map((s) => `경고: "${s.heading}"은(는) 양식에 없는 섹션입니다. 양식의 섹션 이름을 쓸 것.`),
  ];
}

/** 사진 블록의 data-photos 키 목록. 키 없는 자리(나머지 사진 자리)와 사진 블록이 아닌 것은 null. */
function photoKeysOf(html: string): string[] | null {
  const el = parseDocument(html).children.find((n) => n.type === "tag") as Element | undefined;
  if (!el || el.name !== "div" || !(el.attribs.class ?? "").split(/\s+/).includes("photos")) return null;
  const attr = el.attribs["data-photos"];
  return attr == null ? null : attr.split(/\s+/).filter(Boolean);
}

/**
 * changed를 주면 수정 검사다. 이번 실행에서 바뀐 블록만 규칙을 보고, 빠진 필수 섹션은 알리지 않는다.
 * 요청 밖 블록(회사가 직접 쓴 문장 포함)을 고치라고 돌려주면 요청한 부분만 바꾼다는 규칙과 부딪친다.
 */
export function finalChecks(t: ReportTemplate, doc: BlockDoc, photoKeys: string[], opts: { changed?: Set<string> } = {}): string[] {
  const touched = (id: string) => !opts.changed || opts.changed.has(id);
  const out = opts.changed ? [] : missingSections(t, doc).map((h) => `필수 섹션이 없습니다: ${h}`);

  const where = new Map<number, string[]>();
  for (const b of doc.blocks) {
    for (const k of new Set(photoKeysOf(b.html) ?? [])) {
      const no = photoKeys.indexOf(k) + 1;
      if (no > 0) where.set(no, [...(where.get(no) ?? []), b.id]);
    }
  }
  for (const [no, ids] of [...where].sort((a, b) => a[0] - b[0])) {
    if (ids.length > 1 && ids.some(touched)) out.push(`사진 ${no}이(가) 여러 사진 자리(${ids.join(", ")})에 있습니다. 한 자리에만 둘 것.`);
  }

  const rule = doc.blocks.filter((b) => touched(b.id)).flatMap((b) => checkBlock(b.html).map((s) => `[${b.id}] ${s}`));
  out.push(...rule.slice(0, FINAL_MAX));
  if (rule.length > FINAL_MAX) out.push(`규칙 위반 외 ${rule.length - FINAL_MAX}건이 더 있습니다. 위 항목을 고친 뒤 다시 확인.`);
  return out;
}
