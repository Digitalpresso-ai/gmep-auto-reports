import "server-only";
import type { Sql, TransactionSql } from "postgres";
import { db } from "./db";
import { zonedDayStart, zonedMonthStart } from "@/lib/time-zone";
import type { UsageCounts } from "./domain/usage";

// 하루 생성·수정 횟수는 현지(TIME_ZONE) 자정부터 성공한 호출만 센다. 실패한 호출도 토큰은 썼으므로 월 토큰 합계에는 넣는다(AI-9, AI-12).
export async function usageCounts(companyId: string, now = new Date()): Promise<UsageCounts> {
  const dayStart = zonedDayStart(now);
  const [row] = await db()<
    { generate_used: number; revise_used: number; month_tokens: string; daily_generate_limit: number; daily_revise_limit: number; monthly_token_limit: string | null }[]
  >`
    select
      (select count(*)::int from ai_usage where company_id = c.id and kind = 'generate' and success and created_at >= ${dayStart}) as generate_used,
      (select count(*)::int from ai_usage where company_id = c.id and kind = 'revise' and success and created_at >= ${dayStart}) as revise_used,
      (select coalesce(sum(input_tokens + output_tokens), 0) from ai_usage where company_id = c.id and created_at >= ${zonedMonthStart(now)}) as month_tokens,
      c.daily_generate_limit, c.daily_revise_limit, c.monthly_token_limit
    from companies c where c.id = ${companyId}`;
  return {
    generateUsed: row.generate_used,
    generateLimit: row.daily_generate_limit,
    reviseUsed: row.revise_used,
    reviseLimit: row.daily_revise_limit,
    monthTokens: Number(row.month_tokens),
    monthlyTokenLimit: row.monthly_token_limit === null ? null : Number(row.monthly_token_limit),
  };
}

// ai_usage에는 2026-11-04까지 쓰던 공통 사진 설명(kind photo_describe, company_id null) 기록이 남아 있다. 지금은 생성·수정만 기록한다.
export type UsageEntry = {
  companyId: string;
  kind: "generate" | "revise";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  success: boolean;
};

/** sql을 주면 그 트랜잭션 안에서 기록한다. 성공한 수정은 보고서 저장과 한 트랜잭션이어야 횟수와 본문이 어긋나지 않는다. */
export async function recordUsage(e: UsageEntry, sql: Sql | TransactionSql = db()) {
  await sql`insert into ai_usage (company_id, kind, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, success)
             values (${e.companyId}, ${e.kind}, ${e.model}, ${e.inputTokens}, ${e.outputTokens}, ${e.cacheReadTokens ?? 0}, ${e.cacheWriteTokens ?? 0}, ${e.success})`;
}
