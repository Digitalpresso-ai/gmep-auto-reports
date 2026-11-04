import { describe, expect, it } from "vitest";
import { isIsoDate, retentionUntil } from "@/server/domain/dates";

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

