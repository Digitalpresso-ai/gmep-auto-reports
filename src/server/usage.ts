import "server-only";
import { db } from "./db";
import { kstMonthStart, kstToday } from "./domain/dates";
import type { UsageCounts } from "./domain/usage";

// 하루 생성 횟수는 성공한 생성만 센다. 실패한 호출도 토큰은 썼으므로 월 토큰 합계에는 넣는다(AI-9, AI-12).
export async function usageCounts(companyId: string, now = new Date()): Promise<UsageCounts> {
  const dayStart = new Date(`${kstToday(now)}T00:00:00+09:00`);
  const [row] = await db()<{ generate_used: number; month_tokens: string; daily_generate_limit: number; monthly_token_limit: string | null }[]>`
    select
      (select count(*)::int from ai_usage where company_id = c.id and kind = 'generate' and success and created_at >= ${dayStart}) as generate_used,
      (select coalesce(sum(input_tokens + output_tokens), 0) from ai_usage where company_id = c.id and created_at >= ${kstMonthStart(now)}) as month_tokens,
      c.daily_generate_limit, c.monthly_token_limit
    from companies c where c.id = ${companyId}`;
  return {
    generateUsed: row.generate_used,
    generateLimit: row.daily_generate_limit,
    monthTokens: Number(row.month_tokens),
    monthlyTokenLimit: row.monthly_token_limit === null ? null : Number(row.monthly_token_limit),
  };
}

export async function recordUsage(entry: { companyId: string; kind: "generate" | "revise"; model: string; inputTokens: number; outputTokens: number; success: boolean }) {
  await db()`insert into ai_usage (company_id, kind, model, input_tokens, output_tokens, success)
             values (${entry.companyId}, ${entry.kind}, ${entry.model}, ${entry.inputTokens}, ${entry.outputTokens}, ${entry.success})`;
}
