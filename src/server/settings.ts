import "server-only";
import { db } from "./db";
import { isIsoDate, retentionUntil } from "./domain/dates";

// 종료일은 코드에 고정하지 않고 app_settings에서 바꿀 수 있게 둔다(DATA-3)
const DEFAULT_PROGRAM_END = "2026-11-30";
export const DEFAULT_MODEL = "claude-sonnet-5-5";

async function setting(key: string): Promise<unknown> {
  const [row] = await db()<{ value: unknown }[]>`select value from app_settings where key = ${key}`;
  return row?.value;
}

export async function programNotice() {
  const v = await setting("program_end_date");
  const programEndDate = isIsoDate(v) ? v : DEFAULT_PROGRAM_END;
  return { programEndDate, retentionUntil: retentionUntil(programEndDate) };
}

export async function aiModel(): Promise<string> {
  const v = await setting("ai_model");
  return typeof v === "string" && v ? v : (process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL);
}
