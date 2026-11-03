// 관리자 비밀번호(AUTH-12)를 설정하거나 바꾼다. 비밀번호는 셸 기록에 남지 않도록 프롬프트로 받는다.
// 사용: DATABASE_URL=... npm run admin:password
import { createInterface } from "node:readline/promises";
import bcrypt from "bcryptjs";
import postgres from "postgres";

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL 또는 DATABASE_URL이 필요합니다");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question("새 관리자 비밀번호(12자 이상): ");
rl.close();
if (password.length < 12) throw new Error("12자 이상 입력해 주세요");

const sql = postgres(url, { max: 1, prepare: false });
try {
  const hash = await bcrypt.hash(password, 10);
  await sql`insert into admins (id, password_hash) values (1, ${hash})
            on conflict (id) do update set password_hash = excluded.password_hash, failed_count = 0, locked_until = null, updated_at = now()`;
  await sql`delete from admin_sessions`;
  console.log("관리자 비밀번호를 저장했습니다. 기존 관리자 세션은 모두 끊었습니다.");
} finally {
  await sql.end();
}
