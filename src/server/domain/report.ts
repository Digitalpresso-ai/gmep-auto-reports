// 프로토타입 normalize()·renderReport()를 서버로 옮겼다. 참여 사진은 HTML에 넣지 않고 자리만 둔다(사진은 초안의 선택을 따른다).

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

export function renderReportHtml(r: Report): string {
  let n = 0;
  let h = `<h1>${esc(r.title)}</h1>`;
  h += `<h2>${++n}. 기본 정보</h2>` + table(null, r.basic.map((x) => [x[0] ?? "", x[1] ?? ""]), "kv");
  if (r.schedule.length) h += `<h2>${++n}. 일정 및 수행 내용</h2>` + table(["시간", "프로그램", "수행 내용"], r.schedule.map((x) => [x[0] ?? "", x[1] ?? "", x[2] ?? ""]));
  if (r.education.length) {
    h += `<h2>${++n}. 세부 교육 내용</h2>`;
    for (const s of r.education) {
      if (s.title) h += `<h3>${esc(s.title)}</h3>`;
      if (s.table) h += table(s.table.head, s.table.rows);
      h += ul(s.items, true);
    }
  }
  if (r.achievements.length) h += `<h2>${++n}. 주요 성과</h2>` + ul(r.achievements, true);
  if (r.special.length) h += `<h2>${++n}. 특이사항 (별도 성과·미팅)</h2>` + ul(r.special, true);
  if (r.insights.length || r.plans.length) {
    h += `<h2>${++n}. 시사점 및 향후 계획</h2>`;
    if (r.insights.length) h += "<h3>시사점</h3>" + ul(r.insights, true);
    if (r.plans.length) h += "<h3>향후 계획</h3>" + ul(asItems(r.plans), false);
  }
  h += `<h2>${++n}. 참여 사진</h2><div class="photos"></div>`;
  if (r.attachments.length) h += `<h2>${++n}. 첨부</h2>` + ul(asItems(r.attachments), false);
  return h;
}
