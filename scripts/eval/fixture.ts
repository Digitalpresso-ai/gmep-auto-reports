// 평가용 입력: data/의 실제 11/2 자료를 관리자·회사 화면이 저장하는 형태로 바꾼다.
// 텍스트 추출은 src/client/files.ts와 같은 규칙(pdf.js 줄 묶기, [p.N]·[슬라이드 N] 표시)을 Node에서 따른다.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { classifyFile } from "@/lib/classify";
import type { Material } from "@/server/domain/prompt";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const DAY_DIR = path.join(ROOT, "data/Week 1 - Day 1");
export const PROPOSAL_PDF = path.join(ROOT, "data/Digitalpresso G_W - 전자결재.pdf");
export const OUT_ROOT = path.join(ROOT, "data/eval-runs");
const CACHE = path.join(OUT_ROOT, "_cache");

export type EvalPhoto = { file: string; jpgPath: string; width: number; height: number };

async function pdfText(buf: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    let line = "";
    const lines: string[] = [];
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      line += it.str;
      if (it.hasEOL) {
        lines.push(line);
        line = "";
      } else line += " ";
    }
    if (line.trim()) lines.push(line);
    out.push(`[p.${i}]\n` + lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
  }
  return out.join("\n");
}

function xmlText(xml: string, paraTag: string, textTag: string): string {
  return xml
    .split(new RegExp(`</${paraTag}>`))
    .map((p) => (p.match(new RegExp(`<${textTag}[^>]*>([^<]*)</${textTag}>`, "g")) ?? []).map((x) => x.replace(/<[^>]+>/g, "")).join(""))
    .map((s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim())
    .filter(Boolean)
    .join("\n");
}

async function officeText(buf: Buffer, ext: string): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  if (ext === "docx") return xmlText(await zip.file("word/document.xml")!.async("string"), "w:p", "w:t");
  const slideNo = (n: string) => parseInt(n.match(/\d+/g)!.pop()!, 10);
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => slideNo(a) - slideNo(b));
  const out: string[] = [];
  for (const [i, n] of slides.entries()) {
    const t = xmlText(await zip.file(n)!.async("string"), "a:p", "a:t");
    if (t) out.push(`[슬라이드 ${i + 1}]\n${t}`);
  }
  return out.join("\n");
}

export async function extract(file: string): Promise<string> {
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).slice(1).toLowerCase();
  return ext === "pdf" ? pdfText(buf) : officeText(buf, ext);
}

function cached<T>(name: string, make: () => Promise<T>): Promise<T> {
  const f = path.join(CACHE, name);
  if (fs.existsSync(f)) return Promise.resolve(JSON.parse(fs.readFileSync(f, "utf8")));
  return make().then((v) => {
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(v, null, 1));
    return v;
  });
}

/** 관리자 ZIP 분류(classifyFile) 결과 그대로 일정·교육자료·사진을 나눈다. */
export async function loadDay() {
  const files = fs.readdirSync(DAY_DIR, { recursive: true, encoding: "utf8" }).map((f) => path.join(DAY_DIR, f)).filter((f) => fs.statSync(f).isFile()).sort();
  const byKind = (k: string) => files.filter((f) => classifyFile(path.basename(f)) === k);
  const materials = await cached("materials.json", async () => {
    const out: (Material & { kind: "schedule" | "education" })[] = [];
    for (const kind of ["schedule", "education"] as const) for (const f of byKind(kind)) out.push({ kind, filename: path.basename(f), text: await extract(f) });
    return out;
  });
  const proposalText = await cached("proposal.json", () => extract(PROPOSAL_PDF));
  // 브라우저처럼 긴 변 1,100px JPEG로 줄인다(FUNC-6)
  const photoDir = path.join(CACHE, "photos");
  fs.mkdirSync(photoDir, { recursive: true });
  const photos: EvalPhoto[] = byKind("photo").map((f) => {
    const jpgPath = path.join(photoDir, path.basename(f).replace(/\.[^.]+$/, "") + ".jpg");
    if (!fs.existsSync(jpgPath)) execFileSync("sips", ["-Z", "1100", "-s", "format", "jpeg", "-s", "formatOptions", "78", f, "--out", jpgPath], { stdio: "ignore" });
    const info = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", jpgPath], { encoding: "utf8" });
    const num = (k: string) => Number(info.match(new RegExp(`${k}: (\\d+)`))![1]);
    return { file: path.basename(f), jpgPath, width: num("pixelWidth"), height: num("pixelHeight") };
  });
  const ignored = files.filter((f) => classifyFile(path.basename(f)) === "ignore").map((f) => path.basename(f));
  return { materials, proposalText, photos, ignored };
}

// 평가용 회사 정보. 사업 소개는 기안문에 적힌 범위만 쓴다(없는 사실을 넣으면 시사점 평가가 왜곡된다).
export const COMPANY = {
  name: "주식회사 디지털프레소",
  traveler: "김주형(대표이사), 박용태(주임)",
  businessIntro:
    "건설 분야 AI 스타트업. 자사 솔루션 '리네임DP'로 유럽 건설·스마트시티 분야 수요처와 파트너를 발굴하고 현지 적용 가능성을 검증하는 것이 이번 출장 목표.",
};
export const DATE = "2026-11-02";
