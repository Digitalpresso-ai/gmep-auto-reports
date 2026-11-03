import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "postgres";

const migrationsDir = path.join(import.meta.dirname, "migrations");

export async function migrate(sql: Sql): Promise<string[]> {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
  const pending = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql") && !applied.has(f)).sort();
  for (const name of pending) {
    const body = await readFile(path.join(migrationsDir, name), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${name})`;
    });
  }
  return pending;
}

if (import.meta.main) {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL 또는 DATABASE_URL이 필요합니다");
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1 });
  try {
    const applied = await migrate(sql);
    console.log(applied.length ? `적용: ${applied.join(", ")}` : "적용할 migration 없음");
  } finally {
    await sql.end();
  }
}
