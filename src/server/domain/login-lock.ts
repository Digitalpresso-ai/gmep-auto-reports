export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;
export const MIN_PASSWORD_LENGTH = 8;

export type LoginLockState = { failedCount: number; lockedUntil: Date | null };

export function isLocked(state: LoginLockState, now: Date): boolean {
  return state.lockedUntil !== null && now < state.lockedUntil;
}

export function afterFailure(state: LoginLockState, now: Date): LoginLockState {
  // 잠금이 끝났으면 이전 실패는 다시 세지 않는다
  const expired = state.lockedUntil !== null && now >= state.lockedUntil;
  const failedCount = (expired ? 0 : state.failedCount) + 1;
  const lockedUntil = failedCount >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
  return { failedCount, lockedUntil };
}

export function afterSuccess(): LoginLockState {
  return { failedCount: 0, lockedUntil: null };
}

export function validateNewPassword(password: string): string | null {
  return password.length < MIN_PASSWORD_LENGTH ? `${MIN_PASSWORD_LENGTH}자 이상 입력해 주세요` : null;
}
