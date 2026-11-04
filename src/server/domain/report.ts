// 프로토타입 normalize()·renderReport()를 서버로 옮겼다. 사진은 HTML에 넣지 않고 자리만 둔다(사진은 초안의 선택을 따른다).
// AI가 섹션 옆에 둔 사진은 그 섹션 뒤 자리에 사진 키(data-photos)로 적고, 나머지는 키 없는 참여 사진 자리에 들어간다(src/lib/photo-layout.ts).

export type Item = { t: string; sub: string[] };
export type Report = {
  title: string;
  basic: string[][];
  schedule: string[][];
  education: { title: string; items: Item[]; table: { head: string[]; rows: string[][] } | null }[];
  achievements: Item[];
  special: Item[];
  insights: Item[];
  plans: string[];
  attachments: string[];
  photos: { no: number; place: string }[];
};

const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const strs = (x: unknown): string[] => arr(x).map((v) => String(v ?? ""));
const item = (x: unknown): Item => {
  if (typeof x === "string") return { t: x, sub: [] };
  const o = (x ?? {}) as { t?: unknown; sub?: unknown };
  return { t: String(o.t ?? ""), sub: strs(o.sub) };
};

export function parseModelJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function normalizeReport(r: Record<string, unknown>): Report {
  return {
    title: typeof r.title === "string" && r.title ? r.title : "GMEP 일일 출장보고서",
    basic: arr(r.basic).filter((x): x is unknown[] => Array.isArray(x) && Boolean(x[1])).map(strs),
    schedule: arr(r.schedule).filter(Array.isArray).map(strs),
    education: arr(r.education).map((s) => {
      const o = (s ?? {}) as { title?: unknown; items?: unknown; table?: { head?: unknown; rows?: unknown } };
      const rows = arr(o.table?.rows).map(strs);
      return { title: String(o.title ?? ""), items: arr(o.items).map(item), table: rows.length ? { head: strs(o.table?.head), rows } : null };
    }),
    achievements: arr(r.achievements).map(item),
    special: arr(r.special).map(item),
    insights: arr(r.insights).map(item),
    plans: strs(r.plans),
    attachments: strs(r.attachments),
    photos: arr(r.photos).flatMap((x) => {
      const o = (x ?? {}) as { no?: unknown; place?: unknown };
      return Number.isInteger(o.no) && typeof o.place === "string" ? [{ no: o.no as number, place: o.place }] : [];
    }),
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function ul(items: Item[], boldTop: boolean): string {
  if (!items.length) return "";
  return (
    "<ul>" +
    items
      .map((it) => {
        const t = esc(it.t);
        const sub = it.sub.length ? "<ul>" + it.sub.map((s) => `<li>${esc(s)}</li>`).join("") + "</ul>" : "";
        return `<li>${boldTop && sub ? `<strong>${t}</strong>` : t}${sub}</li>`;
      })
      .join("") +
    "</ul>"
  );
}

function table(head: string[] | null, rows: string[][], cls?: string): string {
  return (
    `<table${cls ? ` class="${cls}"` : ""}>` +
    (head ? "<tr>" + head.map((h) => `<th>${esc(h)}</th>`).join("") + "</tr>" : "") +
    rows.map((r) => "<tr>" + r.map((c) => `<td>${esc(c)}</td>`).join("") + "</tr>").join("") +
    "</table>"
  );
}

const asItems = (xs: string[]): Item[] => xs.map((t) => ({ t, sub: [] }));

/** photoKeys[i]는 프롬프트의 [사진 i+1]에 해당하는 사진 키("shared:<id>"). 없는 번호·자리는 참여 사진으로 보낸다. */
export function renderReportHtml(r: Report, photoKeys: string[] = []): string {
  const placed = new Map<string, string[]>();
  for (const p of r.photos) {
    const key = photoKeys[p.no - 1];
    if (!key) continue;
    const list = placed.get(p.place) ?? [];
    if (!list.includes(key)) placed.set(p.place, [...list, key]);
  }
  const box = (place: string) => (placed.get(place)?.length ? `<div class="photos" data-photos="${esc(placed.get(place)!.join(" "))}"></div>` : "");
  return renderSections(r, box, () => true, true);
}

/**
 * 생성 중 미리보기. doneKeys에 든 최상위 키의 섹션만 최종 본문과 같은 마크업·번호로 그린다.
 * 사진 배치(photos)는 맨 끝에 오므로 사진 자리와 참여 사진 섹션은 넣지 않는다.
 */
export function renderPartialReportHtml(partial: Record<string, unknown>, doneKeys: readonly string[]): string {
  const done = new Set(doneKeys);
  return renderSections(normalizeReport(partial), () => "", (...keys) => keys.every((k) => done.has(k)), false);
}

// 번호는 앞 섹션이 비었는지에 따라 정해지므로, 끝나지 않은 키를 만나면 거기서 멈춘다
function renderSections(r: Report, box: (place: string) => string, isDone: (...keys: (keyof Report)[]) => boolean, photoSection: boolean): string {
  let n = 0;
  let h = "";
  if (!isDone("title")) return h;
  h += `<h1>${esc(r.title)}</h1>`;
  if (!isDone("basic")) return h;
  h += `<h2>${++n}. 기본 정보</h2>` + table(null, r.basic.map((x) => [x[0] ?? "", x[1] ?? ""]), "kv");
  if (!isDone("schedule")) return h;
  if (r.schedule.length) h += `<h2>${++n}. 일정 및 수행 내용</h2>` + table(["시간", "프로그램", "수행 내용"], r.schedule.map((x) => [x[0] ?? "", x[1] ?? "", x[2] ?? ""])) + box("schedule");
  if (!isDone("education")) return h;
  if (r.education.length) {
    h += `<h2>${++n}. 세부 교육 내용</h2>`;
    for (const [i, s] of r.education.entries()) {
      if (s.title) h += `<h3>${esc(s.title)}</h3>`;
      if (s.table) h += table(s.table.head, s.table.rows);
      h += ul(s.items, true) + box(`edu:${i + 1}`);
    }
  }
  if (!isDone("achievements")) return h;
  if (r.achievements.length) h += `<h2>${++n}. 주요 성과</h2>` + ul(r.achievements, true);
  if (!isDone("special")) return h;
  if (r.special.length) h += `<h2>${++n}. 특이사항 (별도 성과·미팅)</h2>` + ul(r.special, true);
  if (!isDone("insights", "plans")) return h;
  if (r.insights.length || r.plans.length) {
    h += `<h2>${++n}. 시사점 및 향후 계획</h2>`;
    if (r.insights.length) h += "<h3>시사점</h3>" + ul(r.insights, true);
    if (r.plans.length) h += "<h3>향후 계획</h3>" + ul(asItems(r.plans), false);
  }
  // 모든 사진이 본문에 배치되면 미리보기·Word가 이 제목을 숨기므로 번호 항목의 맨 끝에 둔다. 붙임은 번호 없이 그 뒤에 둔다.
  if (photoSection) h += `<h2>${++n}. 참여 사진</h2><div class="photos"></div>`;
  if (!isDone("attachments")) return h;
  if (r.attachments.length) h += `<h2>붙임</h2>` + ul(asItems(r.attachments), false);
  return h;
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const itemList = { type: "array", items: obj({ t: str, sub: strList }) } as const;

/** Messages API 구조화 출력(output_config.format)용 스키마. 프롬프트의 SCHEMA 예시와 같은 키를 쓴다(AI-5). */
export const REPORT_JSON_SCHEMA = obj({
  title: str,
  basic: { type: "array", items: strList },
  schedule: { type: "array", items: strList },
  education: {
    type: "array",
    items: obj({ title: str, items: itemList, table: { anyOf: [{ type: "null" }, obj({ head: strList, rows: { type: "array", items: strList } })] } }),
  },
  achievements: itemList,
  special: itemList,
  insights: itemList,
  plans: strList,
  attachments: strList,
  photos: { type: "array", items: obj({ no: { type: "integer" }, place: str }) },
});
