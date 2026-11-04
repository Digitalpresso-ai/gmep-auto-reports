// 보고서 본문(body_html)을 최상위 요소 단위의 블록 목록으로 다룬다. AI는 블록 추가·교체·삭제 도구를 차례로 호출해 문서를 쓰고 고친다.
// 블록 HTML은 원문 문자열 구간을 그대로 보관한다. 다시 직렬화하면 회사가 직접 고친 블록의 바이트가 바뀌기 때문이다.
// 도구가 만드는 HTML은 renderReportHtml(report.ts)과 같은 부분집합이며 cleanReportHtml(sanitize.ts)을 통과해도 바뀌지 않는다.
import { DomUtils, parseDocument } from "htmlparser2";

export type Block = { id: string; html: string };
export type BlockDoc = { blocks: Block[] };
/** 모델의 tool_use 블록 그대로: name은 BLOCK_TOOLS의 이름, input은 검증 전 인자. */
export type BlockOp = { name: string; input: unknown };
/** 실패 문구는 tool_result(is_error)로 모델에 돌려준다. */
export type ApplyResult = { ok: true; doc: BlockDoc; id: string } | { ok: false; error: string };

type Node = ReturnType<typeof parseDocument>["children"][number];

const BLOCK_TAGS = new Set(["h1", "h2", "h3", "p", "ul", "ol", "table"]);
const isPhotos = (n: Node) => n.type === "tag" && n.name === "div" && (n.attribs.class ?? "").split(/\s+/).includes("photos");
const isBlockNode = (n: Node) => (n.type === "tag" && BLOCK_TAGS.has(n.name)) || isPhotos(n);
/** 공백 텍스트·주석은 홀로 블록이 되지 않고 앞 블록에 붙는다(문서 맨 앞이면 다음 블록에). */
const isFiller = (n: Node) => n.type === "comment" || (n.type === "text" && !n.data.trim());

/**
 * 최상위 h1/h2/h3/p/ul/ol/table/div.photos는 각각 한 블록이다. 그 밖의 최상위 노드(텍스트, span, br 등)는 이어진 것끼리 한 블록으로 묶는다.
 * 각 블록은 자기 시작 위치부터 다음 블록 시작 직전까지의 원문이므로 renderDoc(parseBlocks(html)) === html이다.
 * 공백만 있는 문서는 블록이 없다.
 */
export function parseBlocks(html: string): BlockDoc {
  const nodes = parseDocument(html, { withStartIndices: true, withEndIndices: true }).children;
  const starts: number[] = [];
  let inGroup = false;
  for (const n of nodes) {
    if (isBlockNode(n)) {
      starts.push(n.startIndex!);
      inGroup = false;
    } else if (!isFiller(n) && !inGroup) {
      starts.push(n.startIndex!);
      inGroup = true;
    }
  }
  if (!starts.length) return { blocks: [] };
  starts[0] = 0;
  return { blocks: starts.map((s, i) => ({ id: `b${i + 1}`, html: html.slice(s, starts[i + 1] ?? html.length) })) };
}

export function renderDoc(doc: BlockDoc): string {
  return doc.blocks.map((b) => b.html).join("");
}

function firstElement(html: string) {
  return parseDocument(html).children.find((n) => n.type === "tag");
}

/** 블록 맨 앞 요소가 h1~h3인 블록의 제목. text는 엔티티를 풀고 공백을 한 칸으로 줄인 값이다. */
export function headingsOf(doc: BlockDoc): { id: string; level: number; text: string }[] {
  return doc.blocks.flatMap((b) => {
    const el = firstElement(b.html);
    if (!el || el.type !== "tag" || !/^h[123]$/.test(el.name)) return [];
    return [{ id: b.id, level: Number(el.name[1]), text: DomUtils.textContent(el).replace(/\s+/g, " ").trim() }];
  });
}

/** 키 없는 사진 자리(<div class="photos">)인지. photo-layout.ts의 assignPhotos는 이 자리 중 마지막에 나머지 사진을 넣는다. */
export function isRestPhotos(block: Block): boolean {
  const el = firstElement(block.html);
  return Boolean(el && el.type === "tag" && isPhotos(el) && el.attribs["data-photos"] == null);
}

/** at번째 위치(0이면 맨 앞)에 HTML 블록을 넣는다. id는 기존 최대 번호 다음이다. */
export function insertBlock(doc: BlockDoc, at: number, html: string): { doc: BlockDoc; id: string } {
  const block = { id: nextId(doc), html };
  return { doc: { blocks: [...doc.blocks.slice(0, at), block, ...doc.blocks.slice(at)] }, id: block.id };
}

// ---------- 블록 → HTML ----------

// cleanReportHtml(sanitize-html)은 텍스트의 &,<,>만 이스케이프한다. 따옴표까지 바꾸면 정리 뒤 바이트가 달라진다.
const escText = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const escAttr = (s: string) => escText(s).replace(/"/g, "&quot;");

type ListItem = { text: string; sub: string[] };

const headingHtml = (level: number, text: string) => `<h${level}>${escText(text)}</h${level}>`;
const paragraphHtml = (text: string) => `<p>${escText(text)}</p>`;
const listHtml = (items: ListItem[]) =>
  "<ul>" +
  items
    .map((it) => {
      const t = escText(it.text);
      return it.sub.length ? `<li><strong>${t}</strong><ul>${it.sub.map((s) => `<li>${escText(s)}</li>`).join("")}</ul></li>` : `<li>${t}</li>`;
    })
    .join("") +
  "</ul>";
const tableHtml = (style: "grid" | "kv", head: string[], rows: string[][]) =>
  (style === "kv" ? '<table class="kv">' : "<table>") +
  (style === "grid" && head.length ? "<tr>" + head.map((h) => `<th>${escText(h)}</th>`).join("") + "</tr>" : "") +
  rows.map((r) => "<tr>" + r.map((c) => `<td>${escText(c)}</td>`).join("") + "</tr>").join("") +
  "</table>";
export const photosHtml = (keys: string[]) => (keys.length ? `<div class="photos" data-photos="${escAttr(keys.join(" "))}"></div>` : '<div class="photos"></div>');

// ---------- 입력 검증 ----------

type Fields = Record<string, unknown>;
type Built = { html: string } | { error: string };

const isStr = (x: unknown): x is string => typeof x === "string";
const isStrList = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);
const nonEmpty = (x: unknown) => isStr(x) && x.trim().length > 0;

function buildHeading(f: Fields): Built {
  if (f.level !== 1 && f.level !== 2 && f.level !== 3) return { error: "level은 1, 2, 3 중 하나여야 합니다." };
  if (!nonEmpty(f.text)) return { error: "text가 비어 있습니다." };
  return { html: headingHtml(f.level, f.text as string) };
}

function buildParagraph(f: Fields): Built {
  if (!nonEmpty(f.text)) return { error: "text가 비어 있습니다." };
  return { html: paragraphHtml(f.text as string) };
}

function buildList(f: Fields): Built {
  const items = f.items;
  if (!Array.isArray(items) || !items.length) return { error: "items는 항목이 하나 이상인 배열이어야 합니다." };
  for (const it of items) {
    const o = it as Fields | null;
    if (!o || typeof o !== "object" || !nonEmpty(o.text) || !isStrList(o.sub)) return { error: "items의 각 항목은 {text: 비어 있지 않은 문자열, sub: 문자열 배열}이어야 합니다." };
  }
  return { html: listHtml(items as ListItem[]) };
}

function buildTable(f: Fields): Built {
  if (f.style !== "grid" && f.style !== "kv") return { error: 'style은 "grid" 또는 "kv"여야 합니다.' };
  if (!isStrList(f.head)) return { error: "head는 문자열 배열이어야 합니다." };
  if (!Array.isArray(f.rows) || !f.rows.length || !f.rows.every(isStrList)) return { error: "rows는 행이 하나 이상인 문자열 배열의 배열이어야 합니다." };
  return { html: tableHtml(f.style, f.head, f.rows as string[][]) };
}

// 사진 자리 도구는 두지 않는다. 고른 사진은 모두 참여 사진 자리에 들어가고, 그 자리는 서버가 넣는다(withRestPhotos).
const BUILDERS: Record<string, (f: Fields) => Built> = {
  heading: buildHeading,
  paragraph: buildParagraph,
  list: buildList,
  table: buildTable,
};

// ---------- 연산 ----------

function nextId(doc: BlockDoc): string {
  const max = Math.max(0, ...doc.blocks.map((b) => Number(/^b(\d+)$/.exec(b.id)?.[1] ?? 0)));
  return `b${max + 1}`;
}

const noBlock = (id: unknown) => ({ ok: false as const, error: `블록 ${String(id)}이(가) 문서에 없습니다. 현재 블록 id만 쓸 수 있습니다.` });

export function applyOp(doc: BlockDoc, op: BlockOp): ApplyResult {
  const f = op.input;
  if (!f || typeof f !== "object" || Array.isArray(f)) return { ok: false, error: "도구 인자는 객체여야 합니다." };
  const input = f as Fields;
  const m = /^(add|replace)_(\w+)$/.exec(op.name);

  if (op.name === "delete_block") {
    const i = doc.blocks.findIndex((b) => b.id === input.id);
    if (i < 0) return noBlock(input.id);
    return { ok: true, doc: { blocks: doc.blocks.filter((_, j) => j !== i) }, id: doc.blocks[i].id };
  }
  if (!m || !BUILDERS[m[2]]) return { ok: false, error: `모르는 도구입니다: ${op.name}` };

  const built = BUILDERS[m[2]](input);
  if ("error" in built) return { ok: false, error: built.error };

  if (m[1] === "replace") {
    const i = doc.blocks.findIndex((b) => b.id === input.id);
    if (i < 0) return noBlock(input.id);
    const blocks = doc.blocks.slice();
    blocks[i] = { id: doc.blocks[i].id, html: built.html };
    return { ok: true, doc: { blocks }, id: blocks[i].id };
  }

  const after = input.after ?? null;
  let at: number;
  if (after === null) at = doc.blocks.length;
  else if (after === "start") at = 0;
  else {
    const i = doc.blocks.findIndex((b) => b.id === after);
    if (i < 0) return noBlock(after);
    at = i + 1;
  }
  return { ok: true, ...insertBlock(doc, at, built.html) };
}

// ---------- 수정 프롬프트 ----------

/**
 * 수정 요청 때 현재 문서를 "[b3] <h2>…</h2>" 줄로 보낸다. 사진 자리는 사진 키 대신 표시만 한다.
 * 키 있는 자리는 예전 생성 결과에 남은 섹션별 자리로, 지금은 사진이 들어가지 않는다.
 */
export function numberedForModel(doc: BlockDoc): string {
  return doc.blocks
    .map((b) => {
      const el = firstElement(b.html);
      let html = b.html.trim();
      if (el && el.type === "tag" && isPhotos(el)) {
        html = el.attribs["data-photos"] == null ? "<p>(참여 사진 자리)</p>" : "<p>(빈 사진 자리)</p>";
      }
      return `[${b.id}] ${html}`;
    })
    .join("\n");
}

// ---------- 도구 정의 ----------

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties }) as const;

const FIELDS = {
  heading: { level: { type: "integer", enum: [1, 2, 3], description: "1은 문서 제목, 2는 섹션 제목, 3은 섹션 안 소제목" }, text: str },
  paragraph: { text: str },
  list: {
    items: {
      type: "array",
      description: "글머리표 항목. sub가 있으면 상위 항목은 굵게 표시된다.",
      items: obj({ text: str, sub: { ...strList, description: "하위 항목. 없으면 빈 배열" } }),
    },
  },
  table: {
    style: { type: "string", enum: ["grid", "kv"], description: "grid는 머리행이 있는 표, kv는 왼쪽 열이 항목명인 2열 표(head 무시)" },
    head: { ...strList, description: "grid의 머리행. 없으면 빈 배열" },
    rows: { type: "array", items: strList },
  },
} as const;

const NAMES = { heading: "제목", paragraph: "문단", list: "목록", table: "표" } as const;
const AFTER = { type: ["string", "null"], description: '이 블록 id 바로 뒤에 넣는다. "start"는 문서 맨 앞, null은 문서 끝' } as const;
const ID = { type: "string", description: "대상 블록 id (예: b3)" } as const;

const kinds = Object.keys(FIELDS) as (keyof typeof FIELDS)[];

/**
 * Messages API tools 배열에 그대로 넣는 정의. 교체는 종류별 도구로 나눈다(replace_list 등).
 * 블록 종류 anyOf를 품은 replace_block 하나보다 각 스키마가 평평해 strict 문법이 단순하고, 종류 판별 필드도 필요 없다.
 */
export const BLOCK_TOOLS = [
  ...kinds.map((k) => ({
    name: `add_${k}`,
    description: `문서에 ${NAMES[k]} 블록 하나를 추가한다. 블록 하나가 끝날 때마다 호출한다.`,
    strict: true,
    input_schema: obj({ ...FIELDS[k], after: AFTER }),
  })),
  ...kinds.map((k) => ({
    name: `replace_${k}`,
    description: `기존 블록 하나를 ${NAMES[k]} 블록으로 바꾼다. id는 유지된다.`,
    strict: true,
    input_schema: obj({ id: ID, ...FIELDS[k] }),
  })),
  { name: "delete_block", description: "기존 블록 하나를 삭제한다.", strict: true, input_schema: obj({ id: ID }) },
];
