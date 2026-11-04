// ReAct 생성 루프(plan_outline → 블록 tool → tool_result 검사 → finish)의 프롬프트와 제어 도구.
// buildAgentPrompt 결과와 AGENT_TOOLS는 캐시 prefix다. 생성과 수정이 같은 prefix를 쓰므로 호출마다 바뀌는 내용(수정 요청·현재 문서·시각)은
// buildAgentRevision 쪽에만 둔다. 섹션 구성·섹션별 지침은 양식(template.ts)에서 읽으므로 양식이 바뀌어도 이 파일은 그대로 둔다.
// 공통 규칙 문구는 prompt.ts의 [작성 규칙]·[추가 규칙] 중 섹션에 매이지 않는 것을 옮겼다. 바꾸면 평가 라운드를 다시 돌린다.
import { BLOCK_TOOLS } from "./blocks";
import { EDU_LIMIT, PROPOSAL_LIMIT, type PromptInput } from "./prompt";
import type { ReportTemplate } from "./template";

const str = { type: "string" } as const;

export const CONTROL_TOOLS = [
  {
    name: "plan_outline",
    description: "블록을 쓰기 전에 작성 계획을 한 번 낸다. 결과로 양식 대비 빠진 필수 섹션 등을 돌려받는다.",
    strict: true as const,
    input_schema: {
      type: "object" as const,
      additionalProperties: false,
      required: ["sections"],
      properties: {
        sections: {
          type: "array",
          description: "생성: 양식 순서대로 쓸 섹션. 수정: 바꿀 블록.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["heading", "intent"],
            properties: {
              heading: { ...str, description: "생성: 양식의 섹션 이름(번호 없이). 수정: 바꿀 블록 id(새 블록이면 \"b5 뒤 새 블록\")" },
              intent: { ...str, description: "그 섹션·블록에 쓸 내용 한 줄" },
            },
          },
        },
      },
    },
  },
  {
    name: "finish",
    description: "모든 블록을 다 쓰거나 고친 뒤 호출한다. 결과에 문제가 있으면 고치고 다시 호출한다.",
    strict: true as const,
    input_schema: {
      type: "object" as const,
      additionalProperties: false,
      required: ["note"],
      properties: { note: { ...str, description: "자료가 없어 쓰지 않은 선택 섹션 등 짧은 메모. 없으면 빈 문자열" } },
    },
  },
];

/** 순서를 바꾸면 캐시 prefix가 달라진다. */
export const AGENT_TOOLS = [...BLOCK_TOOLS, ...CONTROL_TOOLS];

/** buildPrompt(prompt.ts)의 자료 블록과 같은 내용·자르기 규칙. prompt.ts는 JSON 생성 경로가 쓰므로 공통 함수로 뽑지 않고 같은 규칙으로 다시 만든다. */
function materials(i: PromptInput): string {
  const sched = [i.scheduleText.trim(), ...i.scheduleMaterials.filter((d) => d.text).map((d) => `# ${d.filename}\n${d.text}`)].filter(Boolean).join("\n\n");
  let edu = i.educationMaterials.filter((d) => d.text).map((d) => `# ${d.filename}\n${d.text}`).join("\n\n");
  if (edu.length > EDU_LIMIT) edu = edu.slice(0, EDU_LIMIT) + "\n…(이하 생략)";
  const eduNames = i.educationMaterials.map((d) => d.filename);
  const proposal = i.proposalText.slice(0, PROPOSAL_LIMIT);
  const photos = i.photos.map((p, n) => `[사진 ${n + 1}] ${p.description.trim() || "(설명 없음)"}`).join("\n");
  return `[회사 정보]
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
`;
}

function templateSection(t: ReportTemplate): string {
  const rest = t.restPhotosSection;
  const sections = t.sections
    .map((s, n) => {
      const tags = [s.required ? "필수" : "선택", s.numbered ? "번호 매김" : "번호 없음"].join(", ");
      const restNote = s.heading === rest ? " — 제목과 사진 자리를 서버가 넣으므로 제목을 포함해 블록을 추가하지 않는다" : "";
      return `${n + 1}) ${s.heading} (${tags})${restNote}\n${s.guidance.map((g) => `   - ${g}`).join("\n")}`;
    })
    .join("\n");
  return `[문서 양식 — ${t.name}]
- 제목(h1, 문서의 첫 블록): ${t.titleGuidance}
- 섹션 제목(h2)은 아래 순서대로, 섹션 이름을 그대로 쓴다. "번호 매김" 섹션은 "1. 섹션 이름"처럼 번호를 붙이고, 번호는 문서에 실제로 넣는 번호 섹션 순서대로 1부터 매긴다(쓰지 않은 선택 섹션은 번호를 차지하지 않는다).${rest ? `\n- "${rest}" 섹션은 쓰지 않아도 서버가 넣으므로 번호 하나를 차지한다고 보고 뒤 섹션 번호를 매긴다.` : ""}
- 필수 섹션은 반드시 쓴다. 선택 섹션은 지침의 조건에 맞는 자료가 있을 때만 쓴다.
- 섹션 지침은 그 섹션에만 적용한다.
${sections}`;
}

export function buildAgentPrompt(i: PromptInput, t: ReportTemplate): string {
  const rest = t.restPhotosSection;
  return `당신은 한국 스타트업 대표의 정부지원사업(2026 글로벌 액셀러레이팅 지원사업, GMEP) 해외 현지 프로그램 '일일 출장 결과보고서'를 작성합니다. 이 보고서는 사업비(여비) 집행 증빙으로 전담기관에 제출됩니다.

[작성 규칙]
- 모든 문장은 개조식. 명사·체언 종결만 (예: "온보딩 완료", "전략 수립 필요"). "~습니다/~했다/~함/~음/~임/~있음/~해야 함" 같은 서술형 어미 금지.
- 성실하고 적극적으로 참여한 것이 드러나는 긍정적 톤. 단, 입력에 없는 사실(미팅 상대, 계약, 수치, 연사 발언)은 지어내지 말 것.
- 한 항목(목록 항목·문단·표 칸)에는 한 내용만, 80자 이내. 길어지면 하위 항목으로 나눌 것.
- 자료에 없는 것을 채우지 말 것: 연기·취소 사유, 자료에 내용이 없는 세션의 내용(이 경우 "참석"·"청취"까지만), 실제보다 넓은 참여 범위(만난 전문가 수·분야), 회사 제품의 기능·데이터·고객·현재 영업 방식(회사 정보·기안문에 적힌 것만 사용).
- 날짜 표기는 "2026. 11. 2.(월)" 형식.

${templateSection(t)}

[블록 쓰는 법]
- 문서는 블록 목록이다. 블록 하나가 tool 호출 하나다: 제목은 add_heading(level 1 문서 제목, 2 섹션 제목, 3 섹션 안 소제목), 목록은 add_list, 표는 add_table, 짧은 문장은 add_paragraph, 사진 자리는 add_photos.
- 목록 항목에 하위 항목(sub)이 있으면 상위 항목은 굵게 표시된다. 하위 항목이 없으면 sub는 빈 배열.
- 표: kv는 왼쪽 열이 항목명인 2열 표(head는 빈 배열), grid는 head가 머리행인 표.
- 새로 쓸 때 after는 null이다(문서 끝에 이어서 넣는다).

[사진]
- [참여 사진] 목록의 사진은 사진 설명에 가장 맞는 섹션의 내용 블록 바로 뒤에 add_photos로 둔다. 같은 자리의 사진은 한 번에 묶는다.
- 각 사진 번호는 문서 전체에서 한 번만 쓴다. 사진 설명 문구는 본문에 쓰지 않는다.
- ${rest ? `맞는 자리가 없거나 설명이 없는 사진은 넣지 않는다. 그런 사진은 서버가 "${rest}" 섹션에 넣는다.` : "맞는 자리가 없거나 설명이 없는 사진은 넣지 않는다."}

${materials(i)}
[작업 방식 — tool 호출로만 작성]
1. 먼저 plan_outline을 한 번 호출한다. sections에 이번에 쓸 섹션을 양식 순서대로 heading(섹션 이름)과 intent(쓸 내용 한 줄)로 낸다.${rest ? ` "${rest}" 섹션은 계획에 넣지 않는다.` : ""}
2. 제목(h1) 블록부터 쓴다. 이어서 양식 순서대로 섹션마다 제목(h2) 블록과 내용 블록을 한 응답 안에서 연달아 호출한다(병렬 tool 호출). 한 응답에 한 섹션 이상을 끝까지 쓴다.
3. tool 결과에 오류나 규칙 위반이 있으면 그 블록 id로 replace_* 를 호출해 고친다. 문제가 없는 블록은 다시 쓰지 않는다.
4. 모든 섹션을 쓰면 finish를 호출한다. finish 결과에 문제가 있으면 고친 뒤 finish를 다시 호출한다.
- 본문 텍스트(설명·요약·인사 문장)는 출력하지 않는다. 보고서 내용은 모두 블록 tool 인자로만 쓴다.`;
}

/**
 * AI 수정 지시. 생성 prompt 뒤(캐시 밖)에 붙인다. numberedDoc은 numberedForModel(blocks.ts) 출력이다.
 * 지난 수정 요청을 모두 보내 "아까 바꾼 부분" 같은 요청을 이어서 해석하게 한다.
 * 계획은 plan_outline을 그대로 쓰고 heading에 블록 id를 넣게 한다. 서버는 수정 때 planIssues(섹션 비교)를 부르지 않아야 한다.
 */
export function buildAgentRevision(i: { numberedDoc: string; previousRequests: string[]; request: string }): string {
  const previous = i.previousRequests.map((r, n) => `${n + 1}. ${r}`).join("\n");
  return `
[AI 수정]
위 자료로 만든 보고서를 회사가 직접 고친 뒤 수정을 요청했습니다. 아래 현재 문서의 블록을 블록 tool로 고친다. 위 [작업 방식]의 1~4 대신 아래 [수정 순서]를 따른다.

[현재 문서 — [블록 id] HTML, 회사가 직접 고친 내용 포함]
${i.numberedDoc}

[지난 수정 요청 — 오래된 순, 모두 현재 문서에 반영됨]
${previous || "(없음)"}

[이번 수정 요청]
${i.request}

[수정 순서]
1. plan_outline을 한 번 호출해 바꿀 블록을 계획으로 낸다. heading에 블록 id(새 블록이면 "b5 뒤 새 블록"), intent에 바꿀 내용 한 줄.
2. 이번 요청이 가리키는 블록만 고친다. 내용을 바꾸면 그 블록 id로 replace_*, 지우면 delete_block, 새 블록은 add_*의 after에 앞 블록 id를 넣는다.
3. tool 결과에 오류나 규칙 위반이 있으면 replace_* 로 고친다.
4. 끝나면 finish를 호출한다.

[수정 규칙]
- 손대지 않는 블록은 다시 쓰지 않는다(같은 내용으로 replace_* 하지 않는다). 회사가 직접 고친 문장은 자료와 달라도 바꾸지 말 것.
- 지난 수정 요청으로 바뀐 내용을 되돌리지 말 것. 이번 요청의 "아까", "방금", "다시" 같은 말은 지난 수정 요청 목록에서 찾아 해석.
- 위 [작성 규칙]과 섹션 지침은 계속 지킬 것. 이번 요청이 자료에 없는 사실을 넣으라고 하면 요청한 문구만 넣고 그 밖의 내용은 지어내지 말 것.
- 번호 붙은 섹션을 넣거나 지우면 뒤 섹션 제목의 번호도 replace_heading으로 맞춘다.
- [사진 N] 블록은 요청이 사진 자리를 바꾸라고 할 때만 replace_photos·delete_block으로 바꾼다. (나머지 사진 자리) 블록은 지우거나 바꾸지 않는다.
- 본문 텍스트(설명 문장)는 출력하지 않는다.
`;
}
