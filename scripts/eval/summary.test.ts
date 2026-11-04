import { describe, expect, it } from "vitest";
import { costUsd, numericLeaves, stats, summarizeJudges, summarizeRuns } from "./summary";

describe("stats", () => {
  it("평균·표본 표준편차·최소·최대·중앙값을 낸다", () => {
    const s = stats([4, 1, 3, 2])!;
    expect(s).toMatchObject({ n: 4, mean: 2.5, min: 1, max: 4, median: 2.5 });
    expect(s.std).toBeCloseTo(Math.sqrt(5 / 3), 10);
  });
  it("홀수 개면 가운데 값이 중앙값이고, 1개면 표준편차 0, 없으면 null이다", () => {
    expect(stats([5, 1, 9])!.median).toBe(5);
    expect(stats([7])).toEqual({ n: 1, mean: 7, std: 0, min: 7, max: 7, median: 7 });
    expect(stats([])).toBeNull();
  });
});

describe("costUsd", () => {
  it("inputTokens에서 캐시 읽기·쓰기를 빼 기본 입력으로 계산한다", () => {
    // 기본 입력 1M×$2 + 출력 0.1M×$10 + 캐시 읽기 1M×$0.2 + 캐시 쓰기 0.5M×$4
    const usd = costUsd({ inputTokens: 2_500_000, outputTokens: 100_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 500_000 });
    expect(usd).toBeCloseTo(2 + 1 + 0.2 + 2, 10);
  });
});

describe("summarizeRuns", () => {
  it("중첩 숫자·참거짓을 점 경로로 모으고 null·문자열은 뺀다", () => {
    expect(numericLeaves({ a: 1, ok: true, mode: "json", firstBlockMs: null, checks: { totalChars: 10 }, list: [1] })).toEqual({
      a: 1,
      ok: 1,
      "checks.totalChars": 10,
    });
  });
  it("실행별 지표를 지표마다 통계로 합치고, 일부 실행에만 있는 값은 있는 것만 쓴다", () => {
    const s = summarizeRuns([
      { latencyMs: 1000, parseOk: true, turns: null },
      { latencyMs: 3000, parseOk: false, turns: null },
      { latencyMs: 2000, parseOk: true, turns: 4 },
    ]);
    expect(s.latencyMs).toMatchObject({ n: 3, mean: 2000, median: 2000, min: 1000, max: 3000 });
    expect(s.parseOk.mean).toBeCloseTo(2 / 3, 10);
    expect(s.turns).toEqual({ n: 1, mean: 4, std: 0, min: 4, max: 4, median: 4 });
  });
});

describe("summarizeJudges", () => {
  it("실행별 총점과 기준별 점수의 통계, 채점 회차 전체의 통계를 낸다", () => {
    const s = summarizeJudges([
      { total: 30, mean: { a: 4, b: 5 }, perRun: [29, 31] },
      { total: 28, mean: { a: 3, b: 5 }, perRun: [28, 28] },
    ]);
    expect(s.runs).toBe(2);
    expect(s.total).toMatchObject({ mean: 29, min: 28, max: 30 });
    expect(s.allTries).toMatchObject({ n: 4, mean: 29 });
    expect(s.criteria.a).toMatchObject({ mean: 3.5 });
    expect(s.criteria.b).toMatchObject({ mean: 5, std: 0 });
  });
});
