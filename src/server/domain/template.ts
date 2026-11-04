// 보고서 양식(섹션 구성·순서·필수 여부·섹션별 작성 지침)을 코드와 분리한 데이터다. 블록 도구에는 섹션 이름이 없고,
// 프롬프트가 양식을 읽어 섹션을 안내하며, 생성이 끝나면 missingSections로 빠진 필수 섹션을 확인한다.
// 개조식·사실만 같은 공통 작성 규칙은 양식이 아니라 프롬프트(prompt.ts)에 남긴다.
import { applyOp, headingsOf, insertBlock, isRestPhotos, photosHtml, type BlockDoc } from "./blocks";

export type TemplateSection = {
  /** h2 문구. 번호("3. ")는 numbered이면 문서에서 붙이고, 비교할 때는 무시한다. */
  heading: string;
  required: boolean;
  numbered: boolean;
  /** 이 섹션에만 해당하는 작성 지침 문장들. */
  guidance: string[];
};

export type ReportTemplate = {
  id: string;
  name: string;
  /** h1(문서 제목) 작성 지침. */
  titleGuidance: string;
  sections: TemplateSection[];
  /** 본문에 배치되지 않은 선택 사진이 들어갈 섹션의 heading(sections 중 하나). 이 섹션의 키 없는 사진 자리는 withRestPhotos가 넣는다. */
  restPhotosSection?: string;
};

// [작성 규칙]·[추가 규칙](prompt.ts) 중 섹션 하나에 해당하는 문장을 섹션별로 옮겼다. 섹션 구성·순서는 renderReportHtml(report.ts)과 같다.
export const GMEP_DAILY: ReportTemplate = {
  id: "gmep-daily",
  name: "GMEP 일일 출장보고서",
  titleGuidance: "보고서 제목 (예: GMEP 일일 출장보고서 — Day 3 (11.4.) 베를린 파트너 방문)",
  restPhotosSection: "참여 사진",
  sections: [
    {
      heading: "기본 정보",
      required: true,
      numbered: true,
      guidance: [
        "kv 표로 일자, 프로그램명, 주관·운영, 장소, 참석자, 관련 기안(문서번호·제목, 기안문에 있을 때만), 계획 대비 행을 둔다.",
        '계획 대비: 기안문 일정표에서 해당 날짜 계획을 찾아 "계획대로 이행" 등으로 기술.',
        '날짜 표기는 "2026. 11. 2.(월)" 형식, 1주차 몇일차인지 기안 일정으로 추정 가능하면 표기.',
      ],
    },
    {
      heading: "일정 및 수행 내용",
      required: true,
      numbered: true,
      guidance: [
        "grid 표로 시간, 프로그램, 수행 내용 열을 둔다.",
        "일정 항목별 '수행 내용'은 일정·교육자료에서 확인되는 내용으로 구체적으로. 연기·취소된 세션이 자료에 보이면 \"연기\"로 표시.",
        "연기·취소 사유는 자료에 있을 때만 적는다.",
        "장소·투어·네트워킹·단체 사진은 일정 표 아래 사진 자리에 둔다.",
      ],
    },
    {
      heading: "세부 교육 내용",
      required: false,
      numbered: true,
      guidance: [
        "세션마다 h3 소제목(예: 3-1. 세션명)을 두고 그 아래에 내용을 쓴다.",
        "교육자료가 있으면 세션별 핵심 내용을 3~6개 항목으로 요약(통계·사례 포함). 교육자료가 없으면 일정에서 알 수 있는 범위에서 간략히. 전문가 명단 등은 표로.",
        "각 항목의 하위 항목은 2~4개. 회사의 출장 목적(기안문)과 관련 깊은 슬라이드를 우선 반영.",
        "자료의 사실만 쓴다(회사 해석·\"당사 해당 사항\" 금지). 자료에 내용이 없는 세션은 \"참석\"·\"청취\"까지만.",
        "그 세션의 강연·슬라이드·워크숍 장면 사진은 그 세션 뒤 사진 자리에 둔다.",
      ],
    },
    {
      heading: "주요 성과",
      required: true,
      numbered: true,
      guidance: ["프로그램 참여로 얻은 성과 3~5개 (거점·네트워크·역량·시장 이해 등)."],
    },
    {
      heading: "특이사항 (별도 성과·미팅)",
      required: false,
      numbered: true,
      guidance: ["입력의 '특이사항'에 적힌 별도 성과·미팅만 정리. 특이사항이 비어 있으면 이 섹션을 쓰지 않는다."],
    },
    {
      heading: "시사점 및 향후 계획",
      required: true,
      numbered: true,
      guidance: [
        "h3 \"시사점\"과 \"향후 계획\" 소제목 아래에 각각 목록으로 쓴다.",
        '시사점: 반드시 이 회사의 사업·제품 관점에서 "현장에서 직접 느낀 인사이트"처럼 4~6개. 교육 내용을 회사 제품·고객·GTM에 연결 (예: 현지 규제 → 제품 기능 현지화, 구매 구조 → 영업 방식 전환). 일반론 금지.',
        '시사점 각 항목은 상위 항목에 결론, 하위 항목에 "근거: 교육 내용" → "적용: 회사 제품·고객·영업에 연결" 순서. 기안문의 출장 목적 분야를 빠짐없이 다룰 것.',
        "회사 제품의 기능·데이터·고객·현재 영업 방식은 회사 정보·기안문에 적힌 것만 사용.",
        "향후 계획: 다음 일정 대비 및 후속 조치 3~5개. 담당자(출장자 이름)와 시점(날짜 또는 \"11. 3.(화)까지\" 등)을 포함.",
        '다음 일정은 기안문 일정표에서 보고 일자 다음 날짜의 계획으로 지칭(예: "11. 3.(화) ○○ 대비").',
      ],
    },
    {
      heading: "참여 사진",
      required: false,
      numbered: true,
      guidance: ["제목과 사진 자리는 자동으로 들어간다. 이 섹션에는 블록을 추가하지 않는다."],
    },
    {
      heading: "붙임",
      required: false,
      numbered: false,
      guidance: ["받은 교육자료 이름을 한국어로 알기 쉽게 정리 + 출장 기안문."],
    },
  ],
};

/** 앞 번호("3. ", "3-1. ")와 모든 공백을 지운 비교용 문구. */
const norm = (s: string) => s.replace(/^\s*\d+(?:[.-]\d+)*\.?\s*/, "").replace(/\s+/g, "");

/** 필수 섹션 중 문서의 h2에 없는 heading을 양식 순서대로 돌려준다. */
export function missingSections(template: ReportTemplate, doc: BlockDoc): string[] {
  const present = new Set(headingsOf(doc).filter((h) => h.level === 2).map((h) => norm(h.text)));
  return template.sections.filter((s) => s.required && !present.has(norm(s.heading))).map((s) => s.heading);
}

/**
 * 양식이 나머지 사진 섹션을 두면 문서에 키 없는 사진 자리가 하나 이상 있게 한다(assignPhotos가 나머지 사진을 넣는 자리).
 * 생성·수정이 끝나 저장하기 전에 부른다. 섹션 제목이 있으면 그 바로 뒤에 자리를 넣고, 제목도 없으면
 * 양식에서 뒤에 오는 섹션의 첫 h2 앞(없으면 문서 끝)에 제목과 자리를 넣는다. 제목 번호는 그 앞 번호 붙은 h2 수 + 1이다.
 */
export function withRestPhotos(template: ReportTemplate, doc: BlockDoc): BlockDoc {
  const name = template.restPhotosSection;
  if (!name || doc.blocks.some(isRestPhotos)) return doc;
  const h2 = headingsOf(doc).filter((h) => h.level === 2);
  const indexOf = (id: string) => doc.blocks.findIndex((b) => b.id === id);

  const own = h2.find((h) => norm(h.text) === norm(name));
  if (own) return insertBlock(doc, indexOf(own.id) + 1, photosHtml([])).doc;

  const order = template.sections.map((s) => norm(s.heading));
  const restAt = order.indexOf(norm(name));
  const later = restAt < 0 ? undefined : h2.find((h) => order.indexOf(norm(h.text)) > restAt);
  const at = later ? indexOf(later.id) : doc.blocks.length;
  const section = template.sections[restAt];
  const n = h2.filter((h) => indexOf(h.id) < at && /^\d+\./.test(h.text)).length + 1;
  const text = section?.numbered === false ? name : `${n}. ${name}`;

  const r = applyOp(doc, { name: "add_heading", input: { level: 2, text, after: at === 0 ? "start" : doc.blocks[at - 1].id } }, []);
  if (!r.ok) return doc;
  return insertBlock(r.doc, at + 1, photosHtml([])).doc;
}
