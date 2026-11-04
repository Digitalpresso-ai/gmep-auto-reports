// 배포된 DB와 Storage를 행사 시작 전 상태로 되돌린다. 리허설·시험 운영 뒤 실제 행사 전에 한 번 쓴다.
// 사용: node --env-file=.env scripts/reset-db.ts [--all]
//   옵션 없음: 보고서·초안·사진·공통 자료·AI 사용량·세션·로그인 실패 기록을 지운다.
//              회사 행(이름·비밀번호 해시·한도·회사 정보·기안문)·관리자·app_settings·schema_migrations와 Storage의 기안문 파일은 남긴다.
//   --all: 위에 더해 회사 정보·기안문·비밀번호를 비워 초기 비밀번호 발급 전 상태로 만들고 Storage의 기안문 파일도 지운다.
//          회사 행과 관리자 계정은 지우지 않는다.
import type { Sql } from "postgres";

type Options = { all: boolean };

// 운영 중 기록되는 테이블. report_revisions는 reports에, shared_files·shared_materials는 shared_days에 cascade로 묶여 있다.
const DELETE_TABLES = ["reports", "drafts", "company_photos", "shared_days", "ai_usage", "ai_inflight", "sessions", "admin_sessions", "login_attempts"] as const;
const CASCADE_TABLES = ["report_revisions", "shared_files", "shared_materials"] as const;
const KEEP_TABLES = ["companies", "admins", "app_settings", "schema_migrations"] as const;
const SUMMARY_TABLES = [...DELETE_TABLES, ...CASCADE_TABLES, ...KEEP_TABLES];

export async function countRows(sql: Sql): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of SUMMARY_TABLES) {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from ${sql(t)}`;
    counts[t] = n;
  }
  return counts;
}

export async function resetData(sql: Sql, { all }: Options): Promise<void> {
  await sql.begin(async (tx) => {
    for (const t of DELETE_TABLES) await tx`delete from ${tx(t)}`;
    // 관리자 로그인 잠금도 운영 중 생긴 상태라 비운다. 관리자 비밀번호는 유지한다.
    await tx`update admins set failed_count = 0, locked_until = null`;
    if (all) {
      await tx`update companies set password_hash = null, must_change_password = true, traveler = '', business_intro = '',
        proposal_text = '', proposal_filename = null, proposal_storage_path = null, updated_at = now()`;
    }
  });
}

export type ListableBucket = {
  list(
    prefix: string,
    opts: { limit: number; offset: number },
  ): Promise<{ data: { name: string; id: string | null }[] | null; error: { message: string } | null }>;
};

const PAGE = 1000;

// Supabase list는 바로 아래 항목만 주고 폴더 항목의 id가 null이라 폴더마다 다시 나열한다
async function listFiles(bucket: ListableBucket, prefix: string, skip: (folder: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`${prefix} 목록 실패: ${error.message}`);
    const items = data ?? [];
    for (const o of items) {
      const path = `${prefix}/${o.name}`;
      if (o.id) out.push(path);
      else if (!skip(path)) out.push(...(await listFiles(bucket, path, skip)));
    }
    if (items.length < PAGE) return out;
  }
}

export async function storagePathsToRemove(bucket: ListableBucket, { all }: Options): Promise<string[]> {
  // 기본 모드에서는 회사 기안문 원본(companies/<id>/proposal)을 남긴다
  const skip = (folder: string) => !all && /^companies\/[^/]+\/proposal$/.test(folder);
  return [...(await listFiles(bucket, "shared", skip)), ...(await listFiles(bucket, "companies", skip))];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(호스트를 읽지 못했습니다)";
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.some((a) => a !== "--all")) throw new Error("옵션은 --all만 받습니다");
  const all = args.includes("--all");

  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL 또는 DATABASE_URL이 필요합니다");
  const { default: postgres } = await import("postgres");
  const { createInterface } = await import("node:readline/promises");
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

  try {
    console.log(`접속 대상 DB 호스트: ${hostOf(url)}`);
    console.log(all ? "모드: --all (운영 데이터 + 회사 정보·기안문·비밀번호 초기화)" : "모드: 기본 (운영 데이터만 삭제, 회사 정보·기안문·비밀번호 유지)");
    const counts = await countRows(sql);
    console.log("지울 테이블:");
    for (const t of [...DELETE_TABLES, ...CASCADE_TABLES]) console.log(`  ${t}: ${counts[t]}행`);
    console.log("남길 테이블:");
    for (const t of KEEP_TABLES) console.log(`  ${t}: ${counts[t]}행${t === "companies" && all ? " (행은 남기고 회사 정보·비밀번호를 비움)" : ""}`);

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("진행하려면 '초기화'를 입력하세요: ");
    rl.close();
    if (answer.trim() !== "초기화") {
      console.log("취소했습니다. 아무것도 지우지 않았습니다.");
    } else {
      await resetData(sql, { all });
      console.log("DB를 초기화했습니다.");

      const storageUrl = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SECRET_KEY;
      if (!storageUrl || !key) {
        console.log("SUPABASE_URL·SUPABASE_SECRET_KEY가 없어 Storage 파일은 지우지 않았습니다.");
      } else {
        const { createClient } = await import("@supabase/supabase-js");
        const bucket = createClient(storageUrl, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(
          process.env.SUPABASE_PHOTO_BUCKET ?? "report-storages",
        );
        const targets = await storagePathsToRemove(bucket, { all });
        for (let i = 0; i < targets.length; i += 100) {
          const { error } = await bucket.remove(targets.slice(i, i + 100));
          if (error) throw new Error(`Storage 삭제 실패(${i}개 삭제 후): ${error.message}`);
        }
        console.log(`Storage 파일 ${targets.length}개를 지웠습니다.${all ? "" : " 기안문 파일은 남겼습니다."}`);
      }
    }
  } finally {
    await sql.end();
  }
}
