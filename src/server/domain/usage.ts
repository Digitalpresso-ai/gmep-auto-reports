export type UsageCounts = {
  generateUsed: number;
  generateLimit: number;
  monthTokens: number;
  monthlyTokenLimit: number | null;
};

export type UsageView = { generateUsed: number; generateLimit: number; generateRemaining: number; tokenLimitReached: boolean };

export function usageView(u: UsageCounts): UsageView {
  return {
    generateUsed: u.generateUsed,
    generateLimit: u.generateLimit,
    generateRemaining: Math.max(0, u.generateLimit - u.generateUsed),
    tokenLimitReached: u.monthlyTokenLimit !== null && u.monthTokens >= u.monthlyTokenLimit,
  };
}

export function canGenerate(u: UsageCounts): boolean {
  const v = usageView(u);
  return v.generateRemaining > 0 && !v.tokenLimitReached;
}
