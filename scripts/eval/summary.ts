// 반복 실행 결과(meta.json·judge-cc.json)를 라운드 요약으로 합치는 순수 함수. 파일 입출력은 *.eval.ts가 한다.
// 검사: npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/summary.test.ts

// claude-sonnet-5-5의 1M 토큰당 단가(USD). 2026-11-04 작업 지시로 받은 값이다. 단가가 바뀌면 여기만 고친다.
// 캐시 쓰기는 운영 경로가 쓰는 1시간 캐시(cacheTtl "1h") 단가다.
export const PRICE_PER_MTOK = { input: 2, output: 10, cacheRead: 0.2, cacheWrite1h: 4 } as const;
export const PRICE_MODEL = "claude-sonnet-5-5";

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

/** inputTokens는 캐시 읽기·쓰기를 합친 값(src/server/ai.ts)이므로 기본 입력은 그 차이로 계산한다. */
export function costUsd(u: Usage): number {
  const base = Math.max(0, u.inputTokens - u.cacheReadTokens - u.cacheWriteTokens);
  const p = PRICE_PER_MTOK;
  return (base * p.input + u.outputTokens * p.output + u.cacheReadTokens * p.cacheRead + u.cacheWriteTokens * p.cacheWrite1h) / 1_000_000;
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export type Stats = { n: number; mean: number; std: number; min: number; max: number; median: number };

/** 표준편차는 표본 표준편차(n-1)다. 값이 1개면 0이다. 값이 없으면 null. */
export function stats(values: number[]): Stats | null {
  const xs = values.filter((v) => Number.isFinite(v));
  if (!xs.length) return null;
  const n = xs.length;
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  const std = n > 1 ? Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { n, mean, std, min: sorted[0], max: sorted[n - 1], median };
}

/** 숫자·참거짓 값을 "checks.totalChars" 같은 점 경로로 편다. 참거짓은 1/0(비율 평균용), null·문자열·배열은 뺀다. */
export function numericLeaves(obj: unknown, prefix = ""): Record<string, number> {
  const out: Record<string, number> = {};
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "number") out[key] = v;
    else if (typeof v === "boolean") out[key] = v ? 1 : 0;
    else if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, numericLeaves(v, key));
  }
  return out;
}

/** 실행별 meta에서 모든 숫자 지표의 통계를 낸다. 일부 실행에만 있는 지표(null 포함)는 있는 값만으로 낸다. */
export function summarizeRuns(metas: unknown[]): Record<string, Stats> {
  const leaves = metas.map((m) => numericLeaves(m));
  const keys = [...new Set(leaves.flatMap((l) => Object.keys(l)))].sort();
  const out: Record<string, Stats> = {};
  for (const k of keys) {
    const s = stats(leaves.flatMap((l) => (k in l ? [l[k]] : [])));
    if (s) out[k] = s;
  }
  return out;
}

export type JudgeResult = { total: number; mean: Record<string, number>; perRun: number[] };

/** 실행별 채점(각각 TRIES회 평균)을 합친다. total·criteria는 실행 사이의 편차, allTries는 채점 회차 전부의 편차다. */
export function summarizeJudges(judges: JudgeResult[]) {
  const criteria = [...new Set(judges.flatMap((j) => Object.keys(j.mean)))];
  return {
    runs: judges.length,
    total: stats(judges.map((j) => j.total)),
    allTries: stats(judges.flatMap((j) => j.perRun)),
    criteria: Object.fromEntries(criteria.map((k) => [k, stats(judges.flatMap((j) => (k in j.mean ? [j.mean[k]] : [])))])),
  };
}
