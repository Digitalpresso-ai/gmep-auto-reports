// 한 라운드: 실제 11/2 자료로 지금 코드의 사진 설명 → 생성 → HTML → Word 경로를 그대로 돌려 결과를 data/eval-runs/<ROUND>에 남긴다.
// 실행: EVAL_ROUND=r1 npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/run.eval.ts
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { callModel } from "@/server/ai";
import { buildDocx } from "@/server/docx";
import { buildPrompt } from "@/server/domain/prompt";
import { REPORT_JSON_SCHEMA, normalizeReport, parseModelJson, renderReportHtml } from "@/server/domain/report";
import { describeImage } from "@/server/photo-describe";
import { DEFAULT_MODEL } from "@/server/settings";
import { checkReport } from "./checks";
import { COMPANY, DATE, OUT_ROOT, loadDay } from "./fixture";

const ROUND = process.env.EVAL_ROUND ?? "r0";
const MODEL = process.env.EVAL_MODEL ?? DEFAULT_MODEL;
// 회사가 고를 법한 장수. 공통 사진 중 고르게 8장을 고른다.
const SELECT = 8;

if (!process.env.ANTHROPIC_API_KEY) process.loadEnvFile();

// 관리자 업로드 때 한 번만 만드는 설명이므로 라운드끼리 캐시를 같이 쓴다
async function descriptions(photos: { file: string; jpgPath: string }[]): Promise<Record<string, string>> {
  const f = path.join(OUT_ROOT, "_cache", "photo-descriptions.json");
  const cache: Record<string, string> = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  const todo = photos.filter((p) => !cache[p.file]);
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(todo.slice(i, i + 6).map(async (p) => (cache[p.file] = await describeImage(MODEL, new Uint8Array(fs.readFileSync(p.jpgPath)), "image/jpeg"))));
    fs.writeFileSync(f, JSON.stringify(cache, null, 1));
  }
  return cache;
}

it(`라운드 ${ROUND}`, async () => {
  const out = path.join(OUT_ROOT, ROUND);
  fs.mkdirSync(out, { recursive: true });
  const day = await loadDay();
  const desc = await descriptions(day.photos);
  const step = Math.floor(day.photos.length / SELECT);
  const selected = Array.from({ length: SELECT }, (_, i) => day.photos[i * step]);
  const keys = selected.map((p) => `shared:${p.file}`);

  const prompt = buildPrompt({
    companyName: COMPANY.name,
    traveler: COMPANY.traveler,
    businessIntro: COMPANY.businessIntro,
    date: DATE,
    proposalText: day.proposalText,
    scheduleText: "",
    scheduleMaterials: day.materials.filter((m) => m.kind === "schedule"),
    educationMaterials: day.materials.filter((m) => m.kind === "education"),
    notes: "",
    hasScheduleImages: false,
    photos: selected.map((p) => ({ description: desc[p.file] ?? "" })),
  });
  fs.writeFileSync(path.join(out, "prompt.txt"), prompt);

  const started = Date.now();
  const res = await callModel({ model: MODEL, prompt, images: [], jsonSchema: REPORT_JSON_SCHEMA });
  const seconds = Math.round((Date.now() - started) / 1000);
  fs.writeFileSync(path.join(out, "response.txt"), res.text);
  const parsed = parseModelJson(res.text);
  if (!parsed) throw new Error(`JSON 파싱 실패 stop=${res.stopReason}`);
  const report = normalizeReport(parsed);
  const html = renderReportHtml(report, keys);
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1));
  fs.writeFileSync(path.join(out, "report.html"), html);
  const sectionOf = (place: string) => (place.startsWith("edu:") ? `세부 교육 ${report.education[Number(place.slice(4)) - 1]?.title ?? "(없는 세션)"}` : place === "schedule" ? "일정 표 아래" : "참여 사진");
  const placement = selected.map((p, i) => ({ no: i + 1, description: desc[p.file], placedAt: sectionOf(report.photos.find((x) => x.no === i + 1)?.place ?? "photos") }));
  fs.writeFileSync(path.join(out, "placement.json"), JSON.stringify(placement, null, 1));

  const photos = selected.map((p, i) => ({ key: keys[i], bytes: new Uint8Array(fs.readFileSync(p.jpgPath)), width: p.width, height: p.height, type: "jpg" as const }));
  const docx = path.join(out, "report.docx");
  fs.writeFileSync(docx, await buildDocx([{ html, photos }]));
  // Word 레이아웃을 눈으로 볼 때만 LibreOffice로 PDF·쪽 이미지를 만든다(EVAL_RENDER=1). 채점·서비스에는 필요 없다.
  if (process.env.EVAL_RENDER === "1") {
    execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", out, docx], { stdio: "ignore" });
    for (const f of fs.readdirSync(out)) if (f.startsWith("page-")) fs.rmSync(path.join(out, f));
    execFileSync("pdftoppm", ["-jpeg", "-r", "70", path.join(out, "report.pdf"), path.join(out, "page")]);
  }

  const meta = {
    round: ROUND,
    model: res.model,
    stopReason: res.stopReason,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    seconds,
    pages: fs.readdirSync(out).filter((f) => f.startsWith("page-")).length,
    selectedPhotos: selected.map((p) => p.file),
    ignoredFiles: day.ignored,
    checks: checkReport(report),
  };
  fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify(meta, null, 1));
  console.log(JSON.stringify(meta, null, 1));
});
