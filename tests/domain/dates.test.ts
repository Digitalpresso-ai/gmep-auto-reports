import { describe, expect, it } from "vitest";
import { isIsoDate, kstMonthStart, kstToday, retentionUntil } from "@/server/domain/dates";

describe("FUNC-2 보고 일자 기본값", () => {
  it("한국 시간 기준 오늘을 쓴다", () => {
    expect(kstToday(new Date("2026-11-03T14:59:59Z"))).toBe("2026-11-03");
    expect(kstToday(new Date("2026-11-03T15:00:00Z"))).toBe("2026-11-04");
  });

  it("실제 있는 YYYY-MM-DD만 날짜로 인정한다", () => {
    expect(isIsoDate("2026-11-02")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-2")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
});

describe("AI-10 월 토큰 한도 기준일", () => {
  it("한국 시간의 이번 달 1일 0시를 UTC로 돌려준다", () => {
    expect(kstMonthStart(new Date("2026-11-30T16:00:00Z")).toISOString()).toBe("2026-11-30T15:00:00.000Z");
    expect(kstMonthStart(new Date("2026-11-03T00:00:00Z")).toISOString()).toBe("2026-10-31T15:00:00.000Z");
  });
});

describe("DATA-3 보관 기한", () => {
  it("프로그램 종료일부터 1개월 뒤다", () => {
    expect(retentionUntil("2026-11-30")).toBe("2026-12-30");
    expect(retentionUntil("2027-01-31")).toBe("2027-02-28");
  });
});
