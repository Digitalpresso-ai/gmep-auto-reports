// 품질 판정은 judge(LLM)만 한다. 여기서는 라운드 비교용 분량·형식 수치만 남긴다.
import type { Report } from "@/server/domain/report";

export function texts(r: Report): string[] {
  const it = (x: { t: string; sub: string[] }) => [x.t, ...x.sub];
  return [
    r.title,
    ...r.basic.flat(),
    ...r.schedule.flat(),
    ...r.education.flatMap((s) => [s.title, ...s.items.flatMap(it), ...(s.table ? [...s.table.head, ...s.table.rows.flat()] : [])]),
    ...r.achievements.flatMap(it),
    ...r.special.flatMap(it),
    ...r.insights.flatMap(it),
    ...r.plans,
    ...r.attachments,
  ].filter(Boolean);
}

export function checkReport(r: Report) {
  const all = texts(r);
  const basic = Object.fromEntries(r.basic.map(([k, v]) => [k, v]));
  return {
    sections: {
      basic: r.basic.length,
      schedule: r.schedule.length,
      educationSessions: r.education.length,
      educationItems: r.education.reduce((n, s) => n + s.items.length, 0),
      achievements: r.achievements.length,
      special: r.special.length,
      insights: r.insights.length,
      plans: r.plans.length,
      attachments: r.attachments.length,
    },
    dateFormatOk: /2026\. 11\. 2\.\(월\)/.test(basic["일자"] ?? ""),
    planComparison: basic["계획 대비"] ?? "",
    totalChars: all.join("").length,
  };
}
