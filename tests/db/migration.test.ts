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
  it("migration을 순서대로 적용하고 두 번째 실행은 아무것도 적용하지 않는다", async () => {
    expect(await migrate(sql)).toEqual(["0001_init.sql", "0002_shared_days_drafts_admin.sql", "0003_seed_companies.sql", "0004_original_files.sql", "0005_photo_descriptions.sql", "0006_report_revisions.sql"]);
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
    expect(rows.map((r) => r.relname).sort()).toEqual([
      "admin_sessions", "admins", "ai_inflight", "ai_usage", "app_settings", "companies", "company_photos",
      "drafts", "login_attempts", "report_revisions", "reports", "sessions", "shared_days", "shared_files", "shared_materials",
    ]);
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });
});

describe("COMP-1 초기 참가기업", () => {
  it("19개사를 비밀번호 없이 넣는다", async () => {
    const rows = await sql<{ name: string; password_hash: string | null }[]>`
      select name, password_hash from companies where name not in ('A사', 'B사')`;
    expect(rows).toHaveLength(19);
    expect(rows.map((r) => r.name)).toContain("주식회사 디지털프레소");
    expect(rows.every((r) => r.password_hash === null)).toBe(true);
  });
});

describe("FUNC-1 회사 소개", () => {
  it("5,000자까지 허용하고 넘으면 거부한다", async () => {
    await sql`update companies set business_intro = ${"가".repeat(5000)} where name = 'A사'`;
    await expect(sql`update companies set business_intro = ${"가".repeat(5001)} where name = 'A사'`).rejects.toThrow(/companies_business_intro_length/);
  });
});

describe("SHARED-1 날짜별 공통 자료", () => {
  it("공통 파일 종류는 일정 이미지·사진만, 공통 텍스트 종류는 일정·교육자료만 허용한다", async () => {
    await sql`insert into shared_days (report_date) values ('2026-11-02')`;
    await sql`insert into shared_files (report_date, kind, storage_path, filename, width, height) values ('2026-11-02', 'photo', 'shared/2026-11-02/a.jpg', 'a.jpg', 10, 10)`;
    await expect(sql`insert into shared_files (report_date, kind, storage_path, filename, width, height) values ('2026-11-02', 'video', 'x', 'x', 1, 1)`).rejects.toThrow(/shared_files_kind_check/);
    await sql`insert into shared_materials (report_date, kind, filename, text_content) values ('2026-11-02', 'education', 'a.pdf', '내용')`;
    await expect(sql`insert into shared_materials (report_date, kind, filename, text_content) values ('2026-11-02', 'other', 'a.pdf', '내용')`).rejects.toThrow(/shared_materials_kind_check/);
  });

  it("공통 자료 날짜를 지우면 딸린 파일·텍스트도 지운다", async () => {
    await sql`delete from shared_days where report_date = '2026-11-02'`;
    expect((await sql`select 1 from shared_files where report_date = '2026-11-02'`).length).toBe(0);
    expect((await sql`select 1 from shared_materials where report_date = '2026-11-02'`).length).toBe(0);
  });
});

describe("FUNC-17 입력 초안", () => {
  it("회사·날짜별로 하나만 두고, 일정 복사본은 아직 만들지 않았으면 null이다", async () => {
    const [a] = await sql`select id from companies where name = 'A사'`;
    await sql`insert into drafts (company_id, report_date) values (${a.id}, '2026-11-03')`;
    const [d] = await sql`select schedule_text, selected_photos, notes from drafts where company_id = ${a.id}`;
    expect(d).toEqual({ schedule_text: null, selected_photos: [], notes: "" });
    await expect(sql`insert into drafts (company_id, report_date) values (${a.id}, '2026-11-03')`).rejects.toThrow(/drafts_pkey/);
  });
});

describe("AUTH-12 관리자 계정", () => {
  it("관리자 계정은 한 행만 둔다", async () => {
    await sql`insert into admins (id, password_hash) values (1, 'h')`;
    await expect(sql`insert into admins (id, password_hash) values (2, 'h')`).rejects.toThrow(/admins_id_check/);
  });
});

describe("AI-9 동시 생성 방지", () => {
  it("회사마다 진행 중인 생성은 하나만 기록한다", async () => {
    const [a] = await sql`select id from companies where name = 'A사'`;
    await sql`insert into ai_inflight (company_id) values (${a.id})`;
    await expect(sql`insert into ai_inflight (company_id) values (${a.id})`).rejects.toThrow(/ai_inflight_pkey/);
  });
});

describe("FUNC-1·FUNC-5 원본 파일 경로", () => {
  it("기안문 원본은 그 회사 폴더 안에만 둘 수 있다", async () => {
    const [a] = await sql`select id from companies where name = 'A사'`;
    const [b] = await sql`select id from companies where name = 'B사'`;
    await sql`update companies set proposal_storage_path = ${`companies/${a.id}/proposal/x.pdf`} where id = ${a.id}`;
    await expect(sql`update companies set proposal_storage_path = ${`companies/${a.id}/proposal/x.pdf`} where id = ${b.id}`).rejects.toThrow(/companies_proposal_storage_path_check/);
  });

  it("교육자료 원본은 그 날짜의 자료 폴더 안에만 둘 수 있다", async () => {
    await sql`insert into shared_days (report_date) values ('2026-11-04')`;
    await sql`insert into shared_materials (report_date, kind, filename, text_content, storage_path) values ('2026-11-04', 'education', 'a.pdf', 't', 'shared/2026-11-04/materials/a.pdf')`;
    await expect(
      sql`insert into shared_materials (report_date, kind, filename, text_content, storage_path) values ('2026-11-04', 'education', 'a.pdf', 't', 'shared/2026-11-05/materials/a.pdf')`,
    ).rejects.toThrow(/shared_materials_storage_path_check/);
  });
});

describe("FUNC-10 수정 대화", () => {
  it("보고서를 지우면 그 보고서의 수정 대화도 지운다", async () => {
    const [a] = await sql`select id from companies where name = 'A사'`;
    const [r] = await sql`insert into reports (company_id, report_date) values (${a.id}, '2026-11-09') returning id`;
    await sql`insert into report_revisions (report_id, request) values (${r.id}, '시사점을 더 구체적으로')`;
    await expect(sql`insert into report_revisions (report_id, request) values (${r.id}, '')`).rejects.toThrow(/report_revisions_request_check/);
    await sql`delete from reports where id = ${r.id}`;
    expect(await sql`select 1 from report_revisions where report_id = ${r.id}`).toHaveLength(0);
  });
});
