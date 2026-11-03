import { describe, expect, it } from "vitest";
import { LOCK_MINUTES, MAX_FAILURES, afterFailure, afterSuccess, isLocked, validateNewPassword } from "@/server/domain/login-lock";

const t0 = new Date("2026-11-04T10:00:00Z");
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);

describe("AUTH-5 로그인 5회 연속 실패 시 15분 잠금", () => {
  it("4회 실패까지는 잠그지 않고 5회째에 15분 잠근다", () => {
    let state = { failedCount: 0, lockedUntil: null as Date | null };
    for (let i = 1; i < MAX_FAILURES; i++) {
      state = afterFailure(state, t0);
      expect(isLocked(state, t0)).toBe(false);
    }
    state = afterFailure(state, t0);
    expect(state.lockedUntil).toEqual(minutes(LOCK_MINUTES));
    expect(isLocked(state, minutes(14))).toBe(true);
    expect(isLocked(state, minutes(15))).toBe(false);
  });

  it("성공하면 실패 횟수를 초기화한다", () => {
    const state = afterSuccess();
    expect(state).toEqual({ failedCount: 0, lockedUntil: null });
    expect(afterFailure(state, t0).failedCount).toBe(1);
  });

  it("잠금이 끝난 뒤의 실패는 1회부터 다시 센다", () => {
    const locked = { failedCount: MAX_FAILURES, lockedUntil: minutes(LOCK_MINUTES) };
    const next = afterFailure(locked, minutes(16));
    expect(next).toEqual({ failedCount: 1, lockedUntil: null });
  });
});

describe("AUTH-3 새 비밀번호 조건", () => {
  it("8자 미만을 거부한다", () => {
    expect(validateNewPassword("1234567")).toBe("8자 이상 입력해 주세요");
    expect(validateNewPassword("12345678")).toBeNull();
  });
});
