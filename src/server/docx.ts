import "server-only";
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, LevelFormat, Packer, PageBreak, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, WidthType, type FileChild, type ParagraphChild,
} from "docx";
import { parseDocument } from "htmlparser2";
import { assignPhotos, parsePhotoKeys } from "@/lib/photo-layout";

// 프로토타입 docChildren()·buildDocx()를 브라우저 DOM 대신 htmlparser2 트리로 옮겼다(FUNC-11)
const FONT = "맑은 고딕";
const A4 = { width: 11906, height: 16838 };
const CONTENT_WIDTH = 9638;
// 사진은 2열 격자로 넣는다. 한 칸은 4:3 가로 사진 기준 300×225px 안에 맞추고, 1장뿐이면 가운데 크게 둔다.
const CELL_PX = { width: 300, height: 225 };
const SINGLE_PX = { width: 420, height: 315 };

type Node = { type: string; data?: string; name?: string; attribs?: Record<string, string>; children?: Node[] };
/** key는 photoKey()("shared:<id>"). 배열은 회사가 고른 순서다. */
export type DocxPhoto = { key: string; bytes: Uint8Array; width: number; height: number; type: "jpg" | "png" };

const isTag = (n: Node, ...names: string[]) => n.type === "tag" && names.includes(n.name!);
const kids = (n: Node) => n.children ?? [];
const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

function textOf(n: Node): string {
  if (n.type === "text") return decode(n.data ?? "");
  return kids(n).map(textOf).join("");
}

function runsOf(node: Node, bold = false): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const ch of kids(node)) {
    if (ch.type === "text") {
      const t = decode(ch.data ?? "").replace(/\s+/g, " ");
      if (t) out.push(new TextRun({ text: t, font: FONT, size: 20, bold }));
    } else if (ch.type === "tag" && !isTag(ch, "ul", "ol", "table")) {
      if (ch.name === "br") out.push(new TextRun({ break: 1 }));
      else out.push(...runsOf(ch, bold || isTag(ch, "strong", "b")));
    }
  }
  return out;
}

function listParas(list: Node, level: number, acc: FileChild[]) {
  for (const li of kids(list)) {
    if (!isTag(li, "li")) continue;
    acc.push(new Paragraph({ children: runsOf(li), numbering: { reference: "bul", level }, spacing: { after: 40 } }));
    for (const sub of kids(li)) if (isTag(sub, "ul", "ol")) listParas(sub, Math.min(level + 1, 2), acc);
  }
}

function rowsOf(n: Node): Node[] {
  return kids(n).flatMap((c) => (isTag(c, "tr") ? [c] : isTag(c, "thead", "tbody") ? rowsOf(c) : []));
}

function tableOf(tbl: Node): Table {
  const rows = rowsOf(tbl);
  const cells = rows.map((r) => kids(r).filter((c) => isTag(c, "td", "th")));
  const cols = Math.max(1, ...cells.map((c) => c.length));
  const kv = (tbl.attribs?.class ?? "").split(/\s+/).includes("kv");
  const widths = kv ? [1800, CONTENT_WIDTH - 1800] : cols === 3 ? [1300, 2900, CONTENT_WIDTH - 4200] : Array(cols).fill(Math.floor(CONTENT_WIDTH / cols));
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: cells.map(
      (row) =>
        new TableRow({
          children: row.map((c, ci) => {
            const head = c.name === "th" || (kv && ci === 0);
            return new TableCell({
              width: { size: widths[ci] ?? widths[widths.length - 1], type: WidthType.DXA },
              shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: "EEF1F5" } : undefined,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: runsOf(c, head) })],
            });
          }),
        }),
    ),
  });
}

function heading(text: string, level: "h1" | "h2" | "h3"): Paragraph {
  const run = (size: number) => [new TextRun({ text: text.trim(), font: FONT, size, bold: true, color: "1D2330" })];
  if (level === "h1") return new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: run(32), spacing: { after: 240 } });
  if (level === "h2")
    return new Paragraph({
      heading: HeadingLevel.HEADING_1, children: run(26), spacing: { before: 320, after: 120 }, keepNext: true,
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "1D2330", space: 2 } },
    });
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: run(22), spacing: { before: 180, after: 80 }, keepNext: true });
}

function fit(p: DocxPhoto, box: { width: number; height: number }) {
  const scale = Math.min(box.width / p.width, box.height / p.height);
  return { width: Math.round(p.width * scale), height: Math.round(p.height * scale) };
}

const imageParagraph = (p: DocxPhoto, box: { width: number; height: number }) =>
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: p.type, data: p.bytes, transformation: fit(p, box) })] });

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

function photoBlock(photos: DocxPhoto[]): FileChild[] {
  if (photos.length === 1) return [imageParagraph(photos[0], SINGLE_PX), new Paragraph({ children: [], spacing: { after: 120 } })];
  const half = CONTENT_WIDTH / 2;
  const rows: TableRow[] = [];
  for (let i = 0; i < photos.length; i += 2) {
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [photos[i], photos[i + 1]].map(
          (p) =>
            new TableCell({
              width: { size: half, type: WidthType.DXA },
              margins: { top: 60, bottom: 60, left: 60, right: 60 },
              children: [p ? imageParagraph(p, CELL_PX) : new Paragraph({ children: [] })],
            }),
        ),
      }),
    );
  }
  const borders = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };
  return [new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: [half, half], borders, rows }), new Paragraph({ children: [], spacing: { after: 120 } })];
}

const isPhotoBox = (n: Node) => isTag(n, "div") && (n.attribs?.class ?? "").split(/\s+/).includes("photos");

function docChildren(html: string, photos: DocxPhoto[]): FileChild[] {
  const root = parseDocument(html) as unknown as Node;
  const els = kids(root);
  // AI가 섹션 옆에 둔 자리에는 그 사진을, 나머지 고른 사진은 참여 사진 자리에 넣는다(PHOTO-2)
  const boxes = els.filter(isPhotoBox);
  const assigned = assignPhotos(boxes.map((b) => parsePhotoKeys(b.attribs?.["data-photos"])), photos.map((p) => p.key));
  const byKey = new Map(photos.map((p) => [p.key, p]));
  const boxPhotos = new Map(boxes.map((b, i) => [b, assigned[i].map((k) => byKey.get(k)!)]));
  const out: FileChild[] = [];
  for (const [idx, el] of els.entries()) {
    if (el.type === "text") {
      if (textOf(el).trim()) out.push(new Paragraph({ children: [new TextRun({ text: textOf(el).trim(), font: FONT, size: 20 })] }));
      continue;
    }
    if (el.type !== "tag") continue;
    const next = els.slice(idx + 1).find((n) => n.type === "tag");
    // 비어 있는 참여 사진 자리의 제목은 넣지 않는다(사진이 모두 본문에 배치된 경우)
    if (isTag(el, "h2") && next && isPhotoBox(next) && next.attribs?.["data-photos"] === undefined && !boxPhotos.get(next)?.length) continue;
    if (isTag(el, "h1", "h2", "h3")) out.push(heading(textOf(el), el.name as "h1" | "h2" | "h3"));
    else if (isTag(el, "ul", "ol")) listParas(el, 0, out);
    else if (isTag(el, "table")) out.push(tableOf(el), new Paragraph({ children: [] }));
    else if (isPhotoBox(el)) {
      const list = boxPhotos.get(el) ?? [];
      if (list.length) out.push(...photoBlock(list));
    } else if (textOf(el).trim()) out.push(new Paragraph({ children: runsOf(el) }));
  }
  return out;
}

export async function buildDocx(parts: { html: string; photos: DocxPhoto[] }[]): Promise<Buffer> {
  const children = parts.flatMap((p, i) => [...(i > 0 ? [new Paragraph({ children: [new PageBreak()] })] : []), ...docChildren(p.html, p.photos)]);
  const bullet = (level: number, text: string, left: number) => ({
    level, format: LevelFormat.BULLET, text, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left, hanging: 280 } } },
  });
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    numbering: { config: [{ reference: "bul", levels: [bullet(0, "□", 400), bullet(1, "-", 800), bullet(2, "·", 1200)] }] },
    sections: [{ properties: { page: { size: A4, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }],
  });
  return Packer.toBuffer(doc);
}
