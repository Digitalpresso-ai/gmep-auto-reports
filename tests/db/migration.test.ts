import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../db/migrate";

let container: StartedPostgreSqlContainer;
let sql: Sql;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  sql = postgres(container.getConnectionUri(), { max: 1, onnotice: () => {} });
});

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("DATA-1 스키마", () => {
  it("migration을 적용하고 두 번째 실행은 아무것도 적용하지 않는다", async () => {
    expect(await migrate(sql)).toEqual(["0001_init.sql"]);
    expect(await migrate(sql)).toEqual([]);
  });

  it("같은 회사의 같은 보고 일자는 한 건만 허용한다", async () => {
    const [a] = await sql`insert into companies (name) values ('A사') returning id`;
    const [b] = await sql`insert into companies (name) values ('B사') returning id`;
    await sql`insert into reports (company_id, report_date) values (${a.id}, '2026-11-02')`;
    await sql`insert into reports (company_id, report_date) values (${b.id}, '2026-11-02')`;
    await expect(sql`insert into reports (company_id, report_date) values (${a.id}, '2026-11-02')`).rejects.toThrow(/reports_company_id_report_date_key/);
  });

  it("사용량 종류는 생성·수정만 허용한다", async () => {
    const [a] = await sql`select id from companies where name = 'A사'`;
    await expect(sql`insert into ai_usage (company_id, kind, model, success) values (${a.id}, 'other', 'm', true)`).rejects.toThrow(/ai_usage_kind_check/);
  });

  it("모든 업무 테이블에 RLS가 켜져 있다", async () => {
    const rows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select relname, relrowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r' and relname <> 'schema_migrations'`;
    expect(rows.length).toBe(7);
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });
});
