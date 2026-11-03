// 지시서 p.3 작성 규칙 중 기계로 확인할 수 있는 것만 센다. 나머지(사실성·시사점 구체성)는 judge가 본다.
import type { Report } from "@/server/domain/report";

const NARRATIVE = /(습니다|합니다|했다|한다|하였다|이다|였다|된다|됐다|있다|없다|(?<!필)요)\.?$|[가-힣](함|됨|임)\.$/;

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
  const narrative = all.filter((s) => NARRATIVE.test(s.trim()));
  const basic = Object.fromEntries(r.basic.map(([k, v]) => [k, v]));
  return {
    narrativeEndings: narrative,
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
