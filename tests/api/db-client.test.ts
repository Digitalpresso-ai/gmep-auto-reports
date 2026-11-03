import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDb, type TestDb } from "./harness";

let t: TestDb;
beforeAll(async () => {
  t = await startDb();
});
afterAll(() => t?.stop());

describe("공유 DB 클라이언트(Supabase transaction pooler)", () => {
  // 2026-11-03 실제 Supabase pooler(6543)에서 새 연결에 쿼리 두 개를 동시에 보내면 응답이 오지 않았다.
  // 하나씩 보내거나(max_pipeline 1) 연결 직후 타입 조회를 끄면(fetch_types false) 정상이었다. 로컬 PostgreSQL로는 재현되지 않아 설정값을 검사한다.
  it("한 연결에 쿼리를 하나씩만 보내고, 연결 직후 타입 조회를 하지 않고, 멈추지 않도록 시간 제한을 둔다", async () => {
    const { db } = await import("@/server/db");
    const o = db().options;
    expect(o.prepare).toBe(false);
    expect(o.max_pipeline).toBe(1);
    expect(o.fetch_types).toBe(false);
    expect(o.connect_timeout).toBe(10);
    expect(o.queue_timeout).toBe(20);
    expect(o.idle_timeout).toBe(20);
    expect(o.max).toBe(3);
  });

  it("동시 요청의 쿼리가 모두 끝나고 배열·jsonb 매개변수도 그대로 쓴다", async () => {
    const { db } = await import("@/server/db");
    const sql = db();
    const rows = await Promise.all(
      Array.from({ length: 8 }, (_, i) => sql<{ n: number; hit: boolean; j: { a: number } }[]>`
        select ${i}::int as n,
               exists(select 1 from companies where id = any(${["00000000-0000-0000-0000-000000000000"]}::uuid[])) as hit,
               ${sql.json({ a: i })}::jsonb as j`),
    );
    expect(rows.map((r) => r[0].n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(rows.every((r) => r[0].hit === false)).toBe(true);
    expect(rows[3][0].j).toEqual({ a: 3 });
  });
});
