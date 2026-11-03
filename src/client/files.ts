// 프로토타입의 파일 읽기(pdfText·pptxText·docxText)와 사진 축소(toJpegBlob)를 옮겼다.
// 교육자료·기안문 원본은 서버로 보내지 않고 여기서 뽑은 텍스트만 보낸다(FUNC-5).
import { extOf } from "@/lib/classify";

async function pdfText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
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

async function pptxText(buf: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf);
  const slideNo = (n: string) => parseInt(n.match(/\d+/g)!.pop()!, 10);
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => slideNo(a) - slideNo(b));
  const out: string[] = [];
  for (const [i, n] of slides.entries()) {
    const t = xmlText(await zip.file(n)!.async("string"), "a:p", "a:t");
    if (t) out.push(`[슬라이드 ${i + 1}]\n${t}`);
  }
  return out.join("\n");
}

async function docxText(buf: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf);
  const f = zip.file("word/document.xml");
  return f ? xmlText(await f.async("string"), "w:p", "w:t") : "";
}

export async function extractText(file: File): Promise<string> {
  const e = extOf(file.name);
  const buf = await file.arrayBuffer();
  let text = "";
  if (e === "pdf") text = await pdfText(buf);
  else if (e === "pptx") text = await pptxText(buf);
  else if (e === "docx") text = await docxText(buf);
  else if (["txt", "md", "csv"].includes(e)) text = new TextDecoder().decode(buf);
  else throw new Error(`${file.name}: 지원하지 않는 형식입니다(PDF·PPTX·DOCX·텍스트만 가능)`);
  if (!text.trim()) throw new Error(`${file.name}: 글자를 읽을 수 없는 파일입니다(스캔본이면 사진으로 찍어 올려 주세요)`);
  return text;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 열 수 없습니다"));
    img.src = src;
  });
}

/** 긴 변을 max px 이하로 줄인 JPEG. 아이폰 HEIC도 Safari가 열 수 있으면 JPEG로 바뀐다. */
export async function toJpeg(file: Blob, max: number): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url).catch(() => {
      throw new Error("이 사진은 열 수 없습니다(HEIC 등은 JPG로 바꿔 올려 주세요)");
    });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * s);
    canvas.height = Math.round(img.naturalHeight * s);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", max <= 1100 ? 0.78 : 0.85));
    if (!blob) throw new Error("사진을 줄이지 못했습니다");
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function imageForm(img: { blob: Blob; width: number; height: number }, name: string, extra: Record<string, string> = {}): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  f.set("file", img.blob, name.replace(/\.[^.]+$/, "") + ".jpg");
  f.set("width", String(img.width));
  f.set("height", String(img.height));
  return f;
}

/** ZIP을 브라우저에서 풀어 안의 파일을 돌려준다(OPS-3). macOS 메타 파일은 뺀다. */
export async function unzip(file: File): Promise<File[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const out: File[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || /(^|\/)(__MACOSX|\.)/.test(path)) continue;
    const name = path.split("/").pop()!;
    out.push(new File([await entry.async("blob")], name));
  }
  return out;
}
