// 라운드 결과를 지시서 기준(p.2~3 작성 규칙·보고서 항목, p.5 검수 기준)으로 채점한다. 라운드 간 비교를 위해 채점 모델·문구를 고정한다.
// 채점은 서비스 API 키가 아니라 로그인한 Claude Code 구독으로 `claude -p`를 불러 한다. 서비스 API 키는 실제 생성 경로(Sonnet)에만 쓴다.
// 실행: EVAL_ROUND=r1 npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/judge.eval.ts
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "vitest";
import { OUT_ROOT } from "./fixture";

const ROUND = process.env.EVAL_ROUND ?? "r0";
// 같은 결과를 여러 번 채점해 평균을 낸다(채점 편차 확인용)
const TRIES = Number(process.env.EVAL_JUDGE_TRIES ?? 2);
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "opus";

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

// ANTHROPIC_API_KEY가 있으면 claude가 API 키로 과금하므로 자식 환경에서 뺀다. 저장소의 CLAUDE.md·훅이 끼지 않게 임시 폴더에서 도구 없이 돌린다.
function claudeJudge(prompt: string): Promise<{ scores: Record<string, { score: number; reason: string }> }> {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  const args = ["-p", "--model", JUDGE_MODEL, "--effort", "high", "--output-format", "json", "--json-schema", JSON.stringify(schema), "--tools", "", "--no-session-persistence"];
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, { cwd: os.tmpdir(), env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        const res = JSON.parse(out);
        if (code !== 0 || res.is_error || !res.structured_output) throw new Error(res.result ?? `exit ${code}`);
        resolve(res.structured_output);
      } catch (e) {
        reject(new Error(`claude -p 채점 실패: ${e instanceof Error ? e.message : e} ${err.slice(0, 500)}`));
      }
    });
    child.stdin.end(prompt);
  });
}

it(`채점 ${ROUND}`, async () => {
  const dir = path.join(OUT_ROOT, ROUND);
  const read = (f: string) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), "utf8") : "");
  const placement = read("placement.json");
  // 생성 프롬프트의 작성 규칙은 라운드마다 바뀌므로 채점에는 넘기지 않는다. 기준은 지시서(CRITERIA)뿐이고, 자료 부분만 잘라 넘긴다.
  const full = read("prompt.txt");
  const sources = full.slice(full.indexOf("[회사 정보]"), full.lastIndexOf("[출력]")).trim();
  const prompt = `당신은 정부지원사업 전담기관의 출장보고서 검토자입니다. 아래 [입력 자료]만을 근거로 AI가 만든 [보고서]를 채점하세요.
각 기준은 1~5점(5=그대로 제출 가능, 3=손볼 곳 여러 개, 1=사용 불가). 근거 없는 칭찬 없이, 감점 이유를 보고서 문장 인용으로 적으세요.
채점 기준은 아래 [채점 기준]뿐입니다. 기준에 없는 형식 취향(항목 길이, 나열 개수 등)으로 감점하지 마세요.
violations에는 입력 자료에 없는 사실·서술형 어미·잘못된 사진 배치를 인용과 함께 적으세요. improvements에는 보고서를 더 좋게 만들 구체적 개선점을 우선순위 순으로 적으세요.

[채점 기준]
${Object.entries(CRITERIA).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

[입력 자료 — 회사 정보·보고 일자·기안문·일정·교육자료·특이사항·사진 설명]
${sources}

[보고서 JSON]
${read("report.json")}

[사진 배치 — 사진 번호·사진 설명·배치된 위치]
${placement || "(배치 정보 없음: 모든 사진이 마지막 '참여 사진' 절에 나열됨)"}`;

  const runs = await Promise.all(Array.from({ length: TRIES }, () => claudeJudge(prompt)));
  const keys = Object.keys(CRITERIA);
  const mean = Object.fromEntries(keys.map((k) => [k, runs.reduce((n, r) => n + r.scores[k].score, 0) / runs.length]));
  const total = Object.values(mean).reduce((n, v) => n + v, 0);
  const perRun = runs.map((r) => keys.reduce((n, k) => n + r.scores[k].score, 0));
  fs.writeFileSync(path.join(dir, process.env.EVAL_JUDGE_OUT ?? "judge-cc.json"), JSON.stringify({ total, perRun, mean, runs }, null, 1));
  console.log(ROUND, "평균 총점", total, "회차별", perRun, mean);
});
