// 라운드 결과를 지시서 기준(p.2~3 작성 규칙·보고서 항목, p.5 검수 기준)으로 채점한다. 라운드 간 비교를 위해 채점 모델·문구를 고정한다.
// 실행: EVAL_ROUND=r1 npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/judge.eval.ts
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { it } from "vitest";
import { OUT_ROOT } from "./fixture";

const ROUND = process.env.EVAL_ROUND ?? "r0";
const JUDGE_MODEL = "claude-opus-5-5";

if (!process.env.ANTHROPIC_API_KEY) process.loadEnvFile();

const CRITERIA = {
  bullet_style: "모든 문장이 개조식(명사형·체언 종결)인가. 서술형 어미(~습니다, ~했다, ~함.)나 길게 늘어진 문장이 없는가",
  factuality: "입력 자료(기안문·일정·교육자료·특이사항·사진 설명)에 없는 사실(미팅 상대, 계약, 수치, 연사 발언, 시간)을 지어내지 않았는가. 사실과 해석을 구분했는가",
  schedule: "일정·수행 내용이 그날 실제 일정(운영사 자료)과 맞고, 이 회사가 무엇을 했는지 구체적으로 적혔는가",
  education: "세부 교육 내용이 세션별 핵심을 자료에 충실하게(통계·사례 포함) 정리했는가. 분량과 밀도가 적절한가",
  insights: "시사점이 이 회사의 사업·제품 관점의 구체적 인사이트인가(일반론 아님). 향후 계획이 실행 가능한 후속 조치인가",
  evidence_fit: "정부지원사업 여비 증빙용 일일 출장 결과보고서로 바로 제출할 수 있는 구성·톤·완결성인가(기본정보·계획 대비·첨부 포함)",
  photo_placement: "사진이 사진 설명에 맞는 섹션 옆에 배치되었는가. 사진 설명 정보가 없거나 배치 정보가 없으면 1점",
} as const;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "violations", "improvements"],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(CRITERIA),
      properties: Object.fromEntries(
        Object.keys(CRITERIA).map((k) => [k, { type: "object", additionalProperties: false, required: ["score", "reason"], properties: { score: { type: "integer" }, reason: { type: "string" } } }]),
      ),
    },
    violations: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["quote", "problem"], properties: { quote: { type: "string" }, problem: { type: "string" } } },
    },
    improvements: { type: "array", items: { type: "string" } },
  },
} as const;

it(`채점 ${ROUND}`, async () => {
  const dir = path.join(OUT_ROOT, ROUND);
  const read = (f: string) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), "utf8") : "");
  const placement = read("placement.json");
  const prompt = `당신은 정부지원사업 전담기관의 출장보고서 검토자입니다. 아래 [입력 자료]만을 근거로 AI가 만든 [보고서]를 채점하세요.
각 기준은 1~5점(5=그대로 제출 가능, 3=손볼 곳 여러 개, 1=사용 불가). 근거 없는 칭찬 없이, 감점 이유를 보고서 문장 인용으로 적으세요.
violations에는 입력 자료에 없는 사실·서술형 어미·잘못된 사진 배치를 인용과 함께 모두 적으세요. improvements에는 생성 로직(프롬프트·구성)에 줄 구체적 개선점을 우선순위 순으로 적으세요.

[채점 기준]
${Object.entries(CRITERIA).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

[입력 자료 — 보고서 생성에 쓴 프롬프트 전체]
${read("prompt.txt")}

[보고서 JSON]
${read("report.json")}

[사진 배치 — 사진 번호·사진 설명·배치된 위치]
${placement || "(배치 정보 없음: 모든 사진이 마지막 '참여 사진' 절에 나열됨)"}`;

  const client = new Anthropic({ maxRetries: 2, timeout: 600_000 });
  const res = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 16_000,
    output_config: { effort: "high", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const judged = JSON.parse(text);
  const scores = judged.scores as Record<string, { score: number }>;
  const total = Object.values(scores).reduce((n, s) => n + s.score, 0);
  fs.writeFileSync(path.join(dir, "judge.json"), JSON.stringify({ total, ...judged, usage: res.usage }, null, 1));
  console.log(ROUND, "총점", total, Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v.score])));
});
