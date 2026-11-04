// 보고서 HTML(src/server/domain/report.ts renderReportHtml과 같은 부분집합)을 h2 단위로 나누는 순수 함수.
// 생성 방식(json·blocks)과 상관없이 HTML만 보고 사진 배치·수정 범위를 비교하려고 쓴다.
// 검사: npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/sections.test.ts

export type Section = { heading: string; html: string };

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
export const textOf = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** 번호("3. ")를 뗀 제목. 섹션이 빠지거나 늘어 번호가 밀려도 같은 섹션으로 맞춘다. */
export const headingKey = (heading: string) => heading.replace(/^\d+\.\s*/, "").trim();

/** h2마다 나눈다. 첫 h2 앞부분(h1 제목)은 heading이 ""인 섹션이다. */
export function splitSections(html: string): Section[] {
  const parts = html.split(/(?=<h2[\s>])/);
  return parts.map((part) => {
    const m = part.match(/^<h2[^>]*>([\s\S]*?)<\/h2>/);
    return { heading: m ? textOf(m[1]) : "", html: part };
  });
}

/** 사진 키마다 놓인 자리를 "h2 제목 > h3 제목"으로 돌려준다. 본문에 없는 사진은 빠진다. */
export function placementFromHtml(html: string): Map<string, string> {
  const out = new Map<string, string>();
  let h2 = "";
  let h3 = "";
  for (const m of html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>|<h3[^>]*>([\s\S]*?)<\/h3>|<div class="photos" data-photos="([^"]*)"><\/div>/g)) {
    if (m[1] !== undefined) [h2, h3] = [textOf(m[1]), ""];
    else if (m[2] !== undefined) h3 = textOf(m[2]);
    else for (const key of decode(m[3]).split(" ").filter(Boolean)) if (!out.has(key)) out.set(key, h3 ? `${h2} > ${h3}` : h2);
  }
  return out;
}

export type SectionChange = { key: string; status: "same" | "changed" | "added" | "removed" };

// 글자와 사진 자리만 비교한다. 제목 번호·태그 모양·공백 차이는 바뀐 것으로 보지 않는다.
const fingerprint = (html: string) =>
  textOf(html.replace(/^<h2[^>]*>[\s\S]*?<\/h2>/, "")) + "|" + [...html.matchAll(/data-photos="([^"]*)"/g)].map((m) => m[1]).join(";");

function keyed(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of splitSections(html)) {
    const base = s.heading ? headingKey(s.heading) : "(제목)";
    let key = base;
    for (let n = 2; out.has(key); n++) key = `${base}#${n}`;
    out.set(key, fingerprint(s.html));
  }
  return out;
}

/** 수정 전후 HTML을 번호 뗀 h2 제목으로 맞춰 섹션마다 바뀌었는지 돌려준다. 순서는 수정 후 기준, 사라진 섹션은 끝에 둔다. */
export function diffSections(before: string, after: string): SectionChange[] {
  const a = keyed(before);
  const b = keyed(after);
  const out: SectionChange[] = [...b].map(([key, fp]) => ({ key, status: !a.has(key) ? "added" : a.get(key) === fp ? "same" : "changed" }));
  for (const key of a.keys()) if (!b.has(key)) out.push({ key, status: "removed" });
  return out;
}

/** 요청한 섹션(targets, 번호 뗀 h2 제목) 밖에서 바뀐 섹션. */
export function unexpectedChanges(changes: SectionChange[], targets: string[]): SectionChange[] {
  return changes.filter((c) => c.status !== "same" && !targets.includes(c.key.replace(/#\d+$/, "")));
}
