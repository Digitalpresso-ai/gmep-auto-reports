// 프로토타입 buildPrompt()·SCHEMA 문구를 옮기고, 실제 11/2 자료로 돌린 평가(scripts/eval)에서 나온 감점을 [추가 규칙]으로 보탰다(AI-4, PHOTO-2).
// 문구를 바꾸면 보고서 품질이 달라지므로 요구 변경으로 다루고, 바꾼 뒤에는 평가 라운드를 다시 돌린다.

export const EDU_LIMIT = 45_000;
export const PROPOSAL_LIMIT = 15_000;

export const SCHEMA = `{
  "title": "보고서 제목 (예: GMEP 일일 출장보고서 — Day 3 (11.4.) 베를린 파트너 방문)",
  "basic": [["일자","2026. 11. 2.(월) — 베를린 1주차 1일차"],["프로그램명","..."],["주관·운영","..."],["장소","..."],["참석자","..."],["관련 기안","문서번호·제목 (기안문에 있을 때만)"],["계획 대비","기안문 일정과 비교한 이행 여부"]],
  "schedule": [["09:30","프로그램명","수행 내용 (개조식 한 줄)"]],
  "education": [{"title":"3-1. 세션명","items":[{"t":"핵심 항목","sub":["세부 내용"]}],"table":{"head":["분야","전문가"],"rows":[["...","..."]]}}],
  "achievements": [{"t":"성과 제목","sub":["세부"]}],
  "special": [{"t":"별도 성과·미팅 제목","sub":["세부"]}],
  "insights": [{"t":"시사점 제목","sub":["세부"]}],
  "plans": ["향후 계획 한 줄"],
  "attachments": ["첨부 자료명"],
  "photos": [{"no":1,"place":"edu:1"}]
}`;

export type Material = { filename: string; text: string };

export type PromptInput = {
  companyName: string;
  traveler: string;
  businessIntro: string;
  date: string;
  proposalText: string;
  scheduleText: string;
  scheduleMaterials: Material[];
  educationMaterials: Material[];
  notes: string;
  hasScheduleImages: boolean;
  /** 회사가 고른 순서대로. 설명은 관리자가 공통 사진을 올릴 때 AI로 한 번 만든 것이고 회사가 추가한 사진은 비어 있다. */
  photos: { description: string }[];
  extra?: string;
};

export function buildPrompt(i: PromptInput): string {
  const sched = [i.scheduleText.trim(), ...i.scheduleMaterials.filter((d) => d.text).map((d) => `# ${d.filename}\n${d.text}`)].filter(Boolean).join("\n\n");
  let edu = i.educationMaterials.filter((d) => d.text).map((d) => `# ${d.filename}\n${d.text}`).join("\n\n");
  if (edu.length > EDU_LIMIT) edu = edu.slice(0, EDU_LIMIT) + "\n…(이하 생략)";
  const eduNames = i.educationMaterials.map((d) => d.filename);
  const proposal = i.proposalText.slice(0, PROPOSAL_LIMIT);
  const photos = i.photos.map((p, n) => `[사진 ${n + 1}] ${p.description.trim() || "(설명 없음)"}`).join("\n");
  return `당신은 한국 스타트업 대표의 정부지원사업(2026 글로벌 액셀러레이팅 지원사업, GMEP) 해외 현지 프로그램 '일일 출장 결과보고서'를 작성합니다. 이 보고서는 사업비(여비) 집행 증빙으로 전담기관에 제출됩니다.

[작성 규칙]
- 모든 문장은 개조식. "~습니다/~했다/~함." 같은 서술형 어미 금지, 명사형·체언 종결 (예: "온보딩 완료", "전략 수립 필요").
- 성실하고 적극적으로 참여한 것이 드러나는 긍정적 톤. 단, 입력에 없는 사실(미팅 상대, 계약, 수치, 연사 발언)은 지어내지 말 것.
- 일정 항목별 '수행 내용'은 일정·교육자료에서 확인되는 내용으로 구체적으로. 연기·취소된 세션이 자료에 보이면 "연기"로 표시.
- education: 교육자료가 있으면 세션별 핵심 내용을 3~6개 항목으로 요약(통계·사례 포함). 교육자료가 없으면 일정에서 알 수 있는 범위에서 간략히. 전문가 명단 등은 table로.
- achievements: 프로그램 참여로 얻은 성과 3~5개 (거점·네트워크·역량·시장 이해 등).
- special: 아래 '특이사항'에 적힌 별도 성과·미팅만 정리. 특이사항이 비어 있으면 빈 배열.
- insights: 반드시 이 회사의 사업·제품 관점에서 "현장에서 직접 느낀 인사이트"처럼 4~6개. 교육 내용을 회사 제품·고객·GTM에 연결 (예: 현지 규제 → 제품 기능 현지화, 구매 구조 → 영업 방식 전환). 일반론 금지.
- plans: 다음 일정 대비 및 후속 조치 3~5개.
- attachments: 받은 교육자료 이름을 한국어로 알기 쉽게 정리 + 출장 기안문.
- 계획 대비: 기안문 일정표에서 해당 날짜 계획을 찾아 "계획대로 이행" 등으로 기술.
- 날짜 표기는 "2026. 11. 2.(월)" 형식, 1주차 몇일차인지 기안 일정으로 추정 가능하면 표기.

[추가 규칙]
- 개조식 종결은 명사·체언("~ 확인", "~ 수립 필요")만. "~함/~음/~임/~있음/~해야 함"도 서술형으로 보고 쓰지 말 것.
- 한 항목에는 한 내용만, 80자 이내. 길어지면 sub로 나눌 것.
- 자료에 없는 것을 채우지 말 것: 연기·취소 사유, 자료에 내용이 없는 세션의 내용(이 경우 "참석"·"청취"까지만), 실제보다 넓은 참여 범위(만난 전문가 수·분야), 회사 제품의 기능·데이터·고객·현재 영업 방식(회사 정보·기안문에 적힌 것만 사용).
- 다음 일정은 기안문 일정표에서 보고 일자 다음 날짜의 계획으로 지칭(예: "11. 3.(화) ○○ 대비").
- 섹션 역할 분리: education은 자료의 사실만(회사 해석·"당사 해당 사항" 금지), 회사와의 연결은 insights에만.
- education 항목은 세션당 3~6개, 각 항목의 sub는 2~4개. 회사의 출장 목적(기안문)과 관련 깊은 슬라이드를 우선 반영.
- insights 각 항목은 t에 결론, sub에 "근거: 교육 내용" → "적용: 회사 제품·고객·영업에 연결" 순서. 기안문의 출장 목적 분야를 빠짐없이 다룰 것.
- plans는 담당자(출장자 이름)와 시점(날짜 또는 "11. 3.(화)까지" 등)을 포함.
- photos: [참여 사진] 목록의 각 사진을 사진 설명에 가장 맞는 자리에 배치. place 값은 "schedule"(일정 표 아래: 장소·투어·네트워킹·단체 사진), "edu:N"(education 배열의 N번째 세션: 그 세션의 강연·슬라이드·워크숍 장면, N은 1부터), "photos"(맞는 자리가 없거나 설명 없음). 모든 사진 번호를 한 번씩 포함. 사진 설명 문구는 보고서 본문에 쓰지 말 것(참여 사진은 설명 없이 사진만).

[회사 정보]
- 회사명: ${i.companyName.trim() || "(미입력)"}
- 출장자: ${i.traveler.trim() || "(기안문 참조)"}
- 사업·제품: ${i.businessIntro.trim() || "(기안문에서 파악)"}

[보고 일자] ${i.date}

[사전 출장 기안문]
${proposal || "(없음)"}

[운영사 제공 그날 일정]
${sched || (i.hasScheduleImages ? "(첨부 이미지 참조)" : "(없음)")}

[교육자료${eduNames.length ? " — " + eduNames.join(", ") : ""}]
${edu || "(없음)"}

[특이사항 — 별도 성과·미팅 등]
${i.notes.trim() || "(없음)"}

[참여 사진 — 번호·설명]
${photos || "(없음)"}
${i.extra || ""}
[출력] 아래 JSON 하나만 출력 (설명·코드블록 없이). 키 이름은 그대로 유지:
${SCHEMA}`;
}
