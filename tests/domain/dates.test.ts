import { describe, expect, it } from "vitest";
import { berlinDayStart, berlinMonthStart, isIsoDate, retentionUntil } from "@/server/domain/dates";

describe("FUNC-2 보고 일자 기본값", () => {
  it("실제 있는 YYYY-MM-DD만 날짜로 인정한다", () => {
    expect(isIsoDate("2026-11-02")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-2")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
});

describe("DATA-3 보관 기한", () => {
  it("프로그램 종료일부터 1개월 뒤다", () => {
    expect(retentionUntil("2026-11-30")).toBe("2026-12-30");
    expect(retentionUntil("2027-01-31")).toBe("2027-02-28");
  });
});

describe("AI-9·AI-10 사용 횟수는 독일 시간 자정에 다시 센다", () => {
  it("겨울(UTC+1)에는 독일 날짜의 0시를 UTC로 돌려준다", () => {
    expect(berlinDayStart(new Date("2026-11-04T22:59:59Z")).toISOString()).toBe("2026-11-03T23:00:00.000Z");
    expect(berlinDayStart(new Date("2026-11-04T23:00:00Z")).toISOString()).toBe("2026-11-04T23:00:00.000Z");
  });

  it("여름(UTC+2)에도 독일 날짜의 0시를 쓴다", () => {
    expect(berlinDayStart(new Date("2026-07-01T10:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("서머타임이 바뀌는 날에는 그날 0시의 시차를 쓴다", () => {
    expect(berlinDayStart(new Date("2026-03-29T12:00:00Z")).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(berlinDayStart(new Date("2026-10-25T12:00:00Z")).toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });

  it("월 토큰 한도도 독일 시간의 1일 0시부터 센다", () => {
    expect(berlinMonthStart(new Date("2026-11-30T23:30:00Z")).toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(berlinMonthStart(new Date("2026-11-03T00:00:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });
});
