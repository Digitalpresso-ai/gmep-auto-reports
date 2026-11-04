// 수정 평가: 생성 평가의 한 실행 결과에 고정 수정 요청 3개를 순서대로 적용한다(운영 reviseReport와 같은 입력, FUNC-10).
// 요청마다 지연·토큰·캐시 읽기·비용과 결과 HTML을 남기고, 요청하지 않은 h2 섹션이 바뀌었는지 비교한다.
// 실행: EVAL_ROUND=b1 EVAL_RUN=run-1 npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/revise.eval.ts
// 환경변수: EVAL_RUN(기본 run-1, run-*가 없는 예전 라운드는 라운드 폴더) EVAL_MODE(기본 원본 실행의 mode) EVAL_MODEL(기본 운영 기본 모델)
// 결과: <실행 폴더>/revise/step-1..3/(report.html·meta.json 등), <실행 폴더>/revise/summary.json. 원본과 다른 EVAL_MODE면 revise-<mode>/
// 생성 프롬프트가 원본 실행과 바이트 단위로 같아야 캐시를 읽으므로, 다르면 실행하지 않고 멈춘다.
import fs from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { buildPrompt } from "@/server/domain/prompt";
import { DEFAULT_MODEL } from "@/server/settings";
import { checkHtml } from "./checks";
import { OUT_ROOT } from "./fixture";
import { pickGenerator, type GenOutput } from "./generators";
import { evalInput } from "./inputs";
import { diffSections, unexpectedChanges, type SectionChange } from "./sections";
import { addUsage, costUsd, type Usage } from "./summary";

const ROUND = process.env.EVAL_ROUND ?? "r0";
const MODEL = process.env.EVAL_MODEL ?? DEFAULT_MODEL;

// targets는 요청이 바꿔도 되는 h2 섹션(번호 뗀 제목). 3번은 "아까"가 2번 요청을 가리키는지 본다.
const REQUESTS = [
  { request: "세부 교육 내용을 세션마다 핵심 항목 3개로 줄여 주세요.", targets: ["세부 교육 내용"] },
  { request: "시사점 각 항목의 첫 줄(결론)을 더 짧고 단정한 표현으로 바꿔 주세요.", targets: ["시사점 및 향후 계획"] },
  { request: "아까 바꾼 부분에서 각 항목의 근거는 하나씩만 남겨 주세요.", targets: ["시사점 및 향후 계획"] },
] as const;

if (!process.env.ANTHROPIC_API_KEY) process.loadEnvFile();

function stepMeta(n: number, req: (typeof REQUESTS)[number], m: GenOutput["meta"], changes: SectionChange[]) {
  return {
    step: n,
    request: req.request,
    targets: [...req.targets],
    mode: m.mode,
    model: m.model,
    stopReason: m.stopReason,
    latencyMs: m.latencyMs,
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    cacheReadTokens: m.cacheReadTokens,
    cacheWriteTokens: m.cacheWriteTokens,
    costUsd: m.costUsd,
    attempts: m.attempts,
    parseOk: m.parseOk,
    firstBlockMs: m.firstBlockMs,
    turns: m.turns,
    changedSections: changes.filter((c) => c.status !== "same"),
    unexpectedChanges: unexpectedChanges(changes, [...req.targets]),
  };
}

it(`수정 ${ROUND}`, async () => {
  const roundDir = path.join(OUT_ROOT, ROUND);
  const runName = process.env.EVAL_RUN ?? (fs.existsSync(path.join(roundDir, "run-1")) ? "run-1" : ".");
  const runDir = path.join(roundDir, runName);
  const read = (f: string) => fs.readFileSync(path.join(runDir, f), "utf8");
  const source = JSON.parse(read("meta.json"));
  let html = read("report.html");

  const { input } = await evalInput(MODEL);
  if (JSON.stringify(source.photoKeys) !== JSON.stringify(input.photoKeys)) throw new Error("원본 실행과 고른 사진이 다르다");
  if ((source.mode ?? "json") === "json" && buildPrompt(input.promptInput) !== read("prompt.txt"))
    throw new Error("생성 프롬프트가 원본 실행과 달라 캐시를 읽지 못한다. 같은 코드로 생성 평가를 다시 돌린 뒤 수정 평가를 한다");
  const gen = pickGenerator(process.env.EVAL_MODE ?? source.mode ?? "json");

  // 원본과 다른 방식으로 고치면 원본 방식의 수정 결과를 덮어쓰지 않게 폴더를 나눈다
  const outDir = path.join(runDir, gen.mode === (source.mode ?? "json") ? "revise" : `revise-${gen.mode}`);
  fs.rmSync(outDir, { recursive: true, force: true });
  const steps: ReturnType<typeof stepMeta>[] = [];
  const previous: string[] = [];
  for (const [i, req] of REQUESTS.entries()) {
    const dir = path.join(outDir, `step-${i + 1}`);
    fs.mkdirSync(dir, { recursive: true });
    const res = await gen.revise({ ...input, currentHtml: html, previousRequests: [...previous], request: req.request });
    for (const [f, body] of Object.entries(res.files)) fs.writeFileSync(path.join(dir, f), body);
    const step = stepMeta(i + 1, req, res.meta, res.html ? diffSections(html, res.html) : []);
    const detail = { ...step, htmlChecks: res.html ? checkHtml(res.html) : null, attemptsDetail: res.meta.attemptsDetail };
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(detail, null, 1));
    steps.push(step);
    console.log(ROUND, runName, `step-${i + 1}`, { latencyMs: step.latencyMs, cacheReadTokens: step.cacheReadTokens, costUsd: step.costUsd, unexpected: step.unexpectedChanges });
    // 보고서를 못 받으면 다음 요청의 "아까"가 가리킬 결과가 없으므로 멈춘다
    if (!res.html) break;
    fs.writeFileSync(path.join(dir, "report.html"), res.html);
    html = res.html;
    previous.push(req.request);
  }

  const total = steps.reduce<Usage>((u, s) => addUsage(u, s), { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
  const summary = {
    round: ROUND,
    run: runName,
    mode: gen.mode,
    completed: steps.filter((s) => s.parseOk).length,
    requests: REQUESTS.length,
    latencyMs: steps.reduce((n, s) => n + s.latencyMs, 0),
    ...total,
    costUsd: costUsd(total),
    // 요청 밖 섹션이 하나라도 바뀐 단계 수
    stepsWithUnexpectedChanges: steps.filter((s) => s.unexpectedChanges.length > 0).length,
    steps,
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 1));
});
