export type UsageCounts = {
  generateUsed: number;
  generateLimit: number;
  reviseUsed: number;
  reviseLimit: number;
  monthTokens: number;
  monthlyTokenLimit: number | null;
};

export type UsageView = {
  generateUsed: number;
  generateLimit: number;
  generateRemaining: number;
  reviseUsed: number;
  reviseLimit: number;
  reviseRemaining: number;
  tokenLimitReached: boolean;
};

export function usageView(u: UsageCounts): UsageView {
  return {
    generateUsed: u.generateUsed,
    generateLimit: u.generateLimit,
    generateRemaining: Math.max(0, u.generateLimit - u.generateUsed),
    reviseUsed: u.reviseUsed,
    reviseLimit: u.reviseLimit,
    reviseRemaining: Math.max(0, u.reviseLimit - u.reviseUsed),
    tokenLimitReached: u.monthlyTokenLimit !== null && u.monthTokens >= u.monthlyTokenLimit,
  };
}

export function canGenerate(u: UsageCounts): boolean {
  const v = usageView(u);
  return v.generateRemaining > 0 && !v.tokenLimitReached;
}

export function canRevise(u: UsageCounts): boolean {
  const v = usageView(u);
  return v.reviseRemaining > 0 && !v.tokenLimitReached;
}

export type DailyLimits = { dailyGenerateLimit: number; dailyReviseLimit: number };
export const DAILY_LIMIT_MAX = 100;

/** 관리자가 보낸 하루 생성·수정 한도를 읽는다. 둘 다 0~100 정수여야 한다. */
export function parseDailyLimits(body: Record<string, unknown> | null): DailyLimits | null {
  const ok = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= DAILY_LIMIT_MAX;
  const g = body?.dailyGenerateLimit;
  const r = body?.dailyReviseLimit;
  return ok(g) && ok(r) ? { dailyGenerateLimit: g, dailyReviseLimit: r } : null;
}
