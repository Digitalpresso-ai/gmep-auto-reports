import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../db/migrate";
import { countRows, resetData, storagePathsToRemove, type ListableBucket } from "../../scripts/reset-db";

let container: StartedPostgreSqlContainer;
let sql: Sql;

const OPERATION_TABLES = [
  "reports", "report_revisions", "drafts", "company_photos", "shared_days", "shared_files", "shared_materials",
  "ai_usage", "ai_inflight", "sessions", "admin_sessions", "login_attempts",
];

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  sql = postgres(container.getConnectionUri(), { max: 1, onnotice: () => {} });
  await migrate(sql);
});

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

// 행사 중 하루를 보낸 상태: 회사 정보·기안문·비밀번호가 있고 운영 테이블마다 행이 있다
async function seedOperation(): Promise<string> {
  const [c] = await sql<{ id: string }[]>`select id from companies where name = '주식회사 디지털프레소'`;
  await sql`update companies set password_hash = 'hash', must_change_password = false, traveler = '홍길동',
    business_intro = '소개', proposal_text = '기안문', proposal_filename = 'p.pdf',
    proposal_storage_path = ${`companies/${c.id}/proposal/p.pdf`} where id = ${c.id}`;
  await sql`insert into admins (id, password_hash, failed_count) values (1, 'admin-hash', 2)
    on conflict (id) do update set password_hash = excluded.password_hash, failed_count = excluded.failed_count`;
  await sql`insert into app_settings (key, value) values ('event_end', '"2026-11-07"') on conflict (key) do nothing`;
  await sql`insert into sessions (token_hash, company_id, expires_at) values (${`t-${Math.random()}`}, ${c.id}, now() + interval '1 day')`;
  await sql`insert into admin_sessions (token_hash, expires_at) values (${`a-${Math.random()}`}, now() + interval '1 day')`;
  await sql`insert into login_attempts (company_id, failed_count) values (${c.id}, 3) on conflict (company_id) do nothing`;
  await sql`insert into shared_days (report_date, schedule_text) values ('2026-11-04', '일정') on conflict do nothing`;
  await sql`insert into shared_files (report_date, kind, storage_path, filename, width, height) values ('2026-11-04', 'photo', 'shared/2026-11-04/a.jpg', 'a.jpg', 1, 1)`;
  await sql`insert into shared_materials (report_date, kind, filename, text_content) values ('2026-11-04', 'education', 'e.pdf', '자료')`;
  await sql`insert into company_photos (company_id, report_date, storage_path, filename, width, height) values (${c.id}, '2026-11-04', ${`companies/${c.id}/2026-11-04/b.jpg`}, 'b.jpg', 1, 1)`;
  await sql`insert into drafts (company_id, report_date, notes) values (${c.id}, '2026-11-04', '메모') on conflict do nothing`;
  const [r] = await sql<{ id: string }[]>`insert into reports (company_id, report_date, body_html) values (${c.id}, '2026-11-04', '<p>본문</p>')
    on conflict (company_id, report_date) do update set body_html = excluded.body_html returning id`;
  await sql`insert into report_revisions (report_id, request) values (${r.id}, '더 짧게')`;
  await sql`insert into ai_usage (company_id, kind, model, success) values (${c.id}, 'generate', 'm', true)`;
  await sql`insert into ai_usage (company_id, kind, model, success) values (null, 'photo_describe', 'm', true)`;
  await sql`insert into ai_inflight (company_id) values (${c.id}) on conflict do nothing`;
  return c.id;
}

describe("행사 시작 전 상태로 초기화", () => {
  let companyId: string;
  beforeEach(async () => {
    companyId = await seedOperation();
  });

  it("요약에 운영 테이블과 남기는 테이블의 행 수를 모두 센다", async () => {
    const counts = await countRows(sql);
    for (const t of OPERATION_TABLES) expect(counts[t], t).toBeGreaterThan(0);
    expect(counts.companies).toBe(19);
  });

  it("기본 모드는 운영 데이터만 지우고 회사 정보·비밀번호·관리자·설정·migration 기록을 남긴다", async () => {
    const migrations = await sql`select name from schema_migrations order by name`;
    await resetData(sql, { all: false });

    const counts = await countRows(sql);
    for (const t of OPERATION_TABLES) expect(counts[t], t).toBe(0);
    expect(counts.companies).toBe(19);
    expect(counts.admins).toBe(1);
    expect(counts.app_settings).toBe(1);
    expect(await sql`select name from schema_migrations order by name`).toEqual(migrations);

    const [c] = await sql`select password_hash, must_change_password, traveler, business_intro, proposal_text, proposal_filename, proposal_storage_path
      from companies where id = ${companyId}`;
    expect(c).toEqual({
      password_hash: "hash", must_change_password: false, traveler: "홍길동", business_intro: "소개", proposal_text: "기안문",
      proposal_filename: "p.pdf", proposal_storage_path: `companies/${companyId}/proposal/p.pdf`,
    });
    const [a] = await sql`select password_hash, failed_count from admins`;
    expect(a).toEqual({ password_hash: "admin-hash", failed_count: 0 });
  });

  it("--all은 회사 정보·비밀번호까지 처음 상태로 되돌리고 회사 행·관리자는 남긴다", async () => {
    const migrations = await sql`select name from schema_migrations order by name`;
    await resetData(sql, { all: true });

    const counts = await countRows(sql);
    for (const t of OPERATION_TABLES) expect(counts[t], t).toBe(0);
    expect(counts.companies).toBe(19);
    expect(counts.admins).toBe(1);
    expect(await sql`select name from schema_migrations order by name`).toEqual(migrations);

    const rows = await sql`select password_hash, must_change_password, traveler, business_intro, proposal_text, proposal_filename, proposal_storage_path
      from companies`;
    for (const c of rows)
      expect(c).toEqual({
        password_hash: null, must_change_password: true, traveler: "", business_intro: "", proposal_text: "",
        proposal_filename: null, proposal_storage_path: null,
      });
    const [a] = await sql`select password_hash from admins`;
    expect(a.password_hash).toBe("admin-hash");
  });
});

describe("Storage 정리 대상", () => {
  // Supabase list처럼 바로 아래 항목만 돌려주고 폴더는 id가 null이다
  function fakeBucket(files: string[]): ListableBucket {
    return {
      async list(prefix, { limit, offset }) {
        const names = new Map<string, boolean>();
        for (const f of files) {
          if (!f.startsWith(`${prefix}/`)) continue;
          const rest = f.slice(prefix.length + 1).split("/");
          names.set(rest[0], rest.length === 1 || names.get(rest[0]) === true);
        }
        const data = [...names].sort().map(([name, isFile]) => ({ name, id: isFile ? `id-${name}` : null }));
        return { data: data.slice(offset, offset + limit), error: null };
      },
    };
  }
  const files = [
    "shared/2026-11-03/a.jpg",
    "shared/2026-11-03/materials/e.pdf",
    "companies/c1/2026-11-03/b.jpg",
    "companies/c1/proposal/p.pdf",
    "companies/c2/2026-11-04/c.jpg",
  ];

  it("기본 모드는 기안문 폴더를 남기고 날짜 폴더 아래 파일을 모두 찾는다", async () => {
    expect((await storagePathsToRemove(fakeBucket(files), { all: false })).sort()).toEqual([
      "companies/c1/2026-11-03/b.jpg", "companies/c2/2026-11-04/c.jpg", "shared/2026-11-03/a.jpg", "shared/2026-11-03/materials/e.pdf",
    ]);
  });

  it("--all은 기안문 파일도 찾는다", async () => {
    expect((await storagePathsToRemove(fakeBucket(files), { all: true })).sort()).toEqual([...files].sort());
  });

  it("한 번에 다 나오지 않는 폴더는 이어서 나열한다", async () => {
    const many = Array.from({ length: 1205 }, (_, i) => `shared/2026-11-03/${String(i).padStart(4, "0")}.jpg`);
    expect(await storagePathsToRemove(fakeBucket(many), { all: false })).toHaveLength(1205);
  });
});
