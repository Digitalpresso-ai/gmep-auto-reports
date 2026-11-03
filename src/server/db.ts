import "server-only";
import postgres, { type Sql } from "postgres";

let client: Sql | undefined;

export function db(): Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL이 필요합니다");
    // Supabase transaction pooler는 prepared statement를 지원하지 않는다
    client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  }
  return client;
}

export async function closeDb(): Promise<void> {
  await client?.end();
  client = undefined;
}
