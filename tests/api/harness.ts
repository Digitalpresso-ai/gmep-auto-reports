import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import bcrypt from "bcryptjs";
import postgres, { type Sql } from "postgres";
import { migrate } from "../../db/migrate";

export type TestDb = { sql: Sql; stop: () => Promise<void> };

// 앱 코드의 db()가 이 컨테이너를 쓰도록 DATABASE_URL을 바꾼 뒤 route를 import해야 한다
export async function startDb(): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:17-alpine").start();
  process.env.DATABASE_URL = container.getConnectionUri();
  const sql = postgres(container.getConnectionUri(), { max: 1, onnotice: () => {} });
  await migrate(sql);
  return {
    sql,
    stop: async () => {
      await sql.end();
      const { closeDb } = await import("@/server/db");
      await closeDb();
      await container.stop();
    },
  };
}

export async function companyWithPassword(sql: Sql, name: string, password: string, mustChange = false): Promise<string> {
  const hash = await bcrypt.hash(password, 4);
  const [row] = await sql<{ id: string }[]>`
    insert into companies (name, password_hash, must_change_password) values (${name}, ${hash}, ${mustChange})
    on conflict (name) do update set password_hash = excluded.password_hash, must_change_password = excluded.must_change_password
    returning id`;
  return row.id;
}

type Init = { body?: unknown; cookie?: string; form?: FormData };

export function request(method: string, path: string, init: Init = {}): Request {
  const headers = new Headers();
  if (init.cookie) headers.set("cookie", init.cookie);
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.body);
  }
  return new Request(`http://localhost${path}`, { method, headers, body });
}

export function params<T extends Record<string, string>>(p: T) {
  return { params: Promise.resolve(p) };
}

// Set-Cookie에서 "이름=값"만 꺼내 다음 요청의 cookie 헤더로 쓴다
export function cookieOf(res: Response, name: string): string {
  const line = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} 쿠키가 없습니다`);
  return line.split(";")[0];
}

export async function loginCookie(companyId: string, password: string): Promise<string> {
  const { POST } = await import("@/app/api/auth/login/route");
  const res = await POST(request("POST", "/api/auth/login", { body: { companyId, password } }));
  if (res.status !== 200) throw new Error(`로그인 실패 ${res.status}`);
  return cookieOf(res, "gmep_session");
}
