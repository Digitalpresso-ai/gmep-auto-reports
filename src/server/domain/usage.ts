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
