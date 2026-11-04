// 생성 평가: 실제 11/2 자료로 사진 설명 → 생성 → HTML → Word 경로를 운영(src/server/generate.ts)과 같은 조건으로 돌린다.
// 결과는 data/eval-runs/<ROUND>/run-1..N/에, 지표 요약은 <ROUND>/summary.json에 남긴다.
// 실행: EVAL_ROUND=b1 EVAL_REPEAT=5 npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/run.eval.ts
// 환경변수: EVAL_MODE(json, 기본 json) EVAL_MODEL(기본 운영 기본 모델) EVAL_SCHEDULE_TEXT_FILE(일정 텍스트 파일) EVAL_RENDER=1(Word를 PDF·쪽 이미지로)
// 같은 라운드를 다시 돌리면 run-* 결과를 덮어쓴다. 1회차가 1시간 캐시를 쓰고 이후 회차는 캐시를 읽으므로 회차별 meta를 같이 본다.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { buildDocx } from "@/server/docx";
import { DEFAULT_MODEL } from "@/server/settings";
import { checkHtml, checkReport } from "./checks";
import { OUT_ROOT } from "./fixture";
import { pickGenerator } from "./generators";
import { evalInput } from "./inputs";
import { placementFromHtml } from "./sections";
import { PRICE_MODEL, summarizeRuns } from "./summary";

const ROUND = process.env.EVAL_ROUND ?? "r0";
const MODEL = process.env.EVAL_MODEL ?? DEFAULT_MODEL;
const REPEAT = Math.max(1, Number(process.env.EVAL_REPEAT ?? 1));

if (!process.env.ANTHROPIC_API_KEY) process.loadEnvFile();

it(`라운드 ${ROUND} ×${REPEAT}`, async () => {
  const roundDir = path.join(OUT_ROOT, ROUND);
  const gen = pickGenerator();
  const { input, selected, desc, ignored, inputs } = await evalInput(MODEL);
  const metas: unknown[] = [];

  for (let n = 1; n <= REPEAT; n++) {
    const out = path.join(roundDir, `run-${n}`);
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    const res = await gen.generate(input);
    for (const [f, body] of Object.entries(res.files)) fs.writeFileSync(path.join(out, f), body);

    let pages = 0;
    if (res.html) {
      fs.writeFileSync(path.join(out, "report.html"), res.html);
      const where = placementFromHtml(res.html);
      const placement = selected.map((p, i) => ({ no: i + 1, description: desc[p.file], placedAt: where.get(input.photoKeys[i]) ?? "참여 사진" }));
      fs.writeFileSync(path.join(out, "placement.json"), JSON.stringify(placement, null, 1));
      const photos = selected.map((p, i) => ({ key: input.photoKeys[i], bytes: new Uint8Array(fs.readFileSync(p.jpgPath)), width: p.width, height: p.height, type: "jpg" as const }));
      const docx = path.join(out, "report.docx");
      fs.writeFileSync(docx, await buildDocx([{ html: res.html, photos }]));
      // Word 레이아웃을 눈으로 볼 때만 LibreOffice로 PDF·쪽 이미지를 만든다(EVAL_RENDER=1). 채점·서비스에는 필요 없다.
      if (process.env.EVAL_RENDER === "1") {
        execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", out, docx], { stdio: "ignore" });
        execFileSync("pdftoppm", ["-jpeg", "-r", "70", path.join(out, "report.pdf"), path.join(out, "page")]);
        pages = fs.readdirSync(out).filter((f) => f.startsWith("page-")).length;
      }
    }

    const metrics = {
      ...res.meta,
      priceModel: PRICE_MODEL,
      pages,
      inputs,
      photoKeys: input.photoKeys,
      selectedPhotos: selected.map((p) => p.file),
      ignoredFiles: ignored,
      checks: res.report ? checkReport(res.report) : null,
      htmlChecks: res.html ? checkHtml(res.html) : null,
    };
    const meta = { round: ROUND, run: n, ...metrics };
    fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify(meta, null, 1));
    metas.push(metrics);
    // 중간에 호출이 실패해도 끝난 회차까지의 요약이 남게 매 회차 쓴다
    const summary = { round: ROUND, mode: gen.mode, model: MODEL, runs: metas.length, inputs, metrics: summarizeRuns(metas) };
    fs.writeFileSync(path.join(roundDir, "summary.json"), JSON.stringify(summary, null, 1));
    console.log(ROUND, `run-${n}`, { latencyMs: meta.latencyMs, inputTokens: meta.inputTokens, outputTokens: meta.outputTokens, cacheReadTokens: meta.cacheReadTokens, costUsd: meta.costUsd, parseOk: meta.parseOk });
  }
});
