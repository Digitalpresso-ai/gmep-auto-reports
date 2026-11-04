import { describe, expect, it } from "vitest";
import { formatTime, TIME_ZONE, zonedDayStart, zonedMonthStart, zonedToday } from "@/lib/time-zone";

// 서비스의 날짜·시각은 행사 현지 시간(TIME_ZONE)으로 정한다. 아래 기대값은 Europe/Berlin 기준이다.
describe("서비스 시간대", () => {
  it("행사 현지 시간대를 한 곳에서 정한다", () => {
    expect(TIME_ZONE).toBe("Europe/Berlin");
  });

  it("FUNC-2 보고 일자 기본값은 현지 날짜다", () => {
    expect(zonedToday(new Date("2026-11-04T15:30:00Z"))).toBe("2026-11-04");
    expect(zonedToday(new Date("2026-11-04T22:59:59Z"))).toBe("2026-11-04");
    expect(zonedToday(new Date("2026-11-04T23:00:00Z"))).toBe("2026-11-05");
    expect(zonedToday(new Date("2026-07-01T21:59:59Z"))).toBe("2026-07-01");
    expect(zonedToday(new Date("2026-07-01T22:00:00Z"))).toBe("2026-07-02");
  });

  it("AI-9 하루 사용 횟수는 현지 자정부터 센다(겨울·여름·서머타임 바뀌는 날)", () => {
    expect(zonedDayStart(new Date("2026-11-04T22:59:59Z")).toISOString()).toBe("2026-11-03T23:00:00.000Z");
    expect(zonedDayStart(new Date("2026-11-04T23:00:00Z")).toISOString()).toBe("2026-11-04T23:00:00.000Z");
    expect(zonedDayStart(new Date("2026-07-01T10:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(zonedDayStart(new Date("2026-03-29T12:00:00Z")).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(zonedDayStart(new Date("2026-10-25T12:00:00Z")).toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });

  it("AI-10 월 토큰 합계는 현지 1일 0시부터 센다", () => {
    expect(zonedMonthStart(new Date("2026-11-30T23:30:00Z")).toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(zonedMonthStart(new Date("2026-11-03T00:00:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("화면에 보이는 시각은 보는 기기의 시간대와 관계없이 현지 시각이다", () => {
    expect(formatTime(new Date("2026-11-04T08:05:00Z"))).toBe("09:05");
    expect(formatTime("2026-07-01T21:30:00.000Z")).toBe("23:30");
  });
});
