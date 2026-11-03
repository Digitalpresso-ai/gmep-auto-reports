// 지정한 날짜의 공통 자료(일정·일정 이미지·사진·교육자료)를 DB와 Storage에서 지운다. 잘못된 날짜에 올린 자료를 다시 올리기 전에 쓴다.
// 회사 정보·비밀번호·초안·보고서는 건드리지 않는다. 보고서는 공통 사진을 shared_files id로 찾으므로 지운 사진은 그 날짜 보고서에서 빠진다.
// 사용: node --env-file=.env scripts/clear-shared-days.ts 2026-11-03 2026-11-04
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const dates = process.argv.slice(2);
if (!dates.length || !dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error("날짜를 YYYY-MM-DD로 하나 이상 넣어 주세요");

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL 또는 DATABASE_URL이 필요합니다");
const sql = postgres(url, { max: 1, prepare: false });

try {
  const files = await sql<{ report_date: string; kind: string; storage_path: string }[]>`
    select to_char(report_date, 'YYYY-MM-DD') as report_date, kind, storage_path from shared_files where report_date = any(${dates}::date[])`;
  const materials = await sql<{ report_date: string; kind: string; storage_path: string | null }[]>`
    select to_char(report_date, 'YYYY-MM-DD') as report_date, kind, storage_path from shared_materials where report_date = any(${dates}::date[])`;
  const days = await sql<{ report_date: string; chars: number }[]>`
    select to_char(report_date, 'YYYY-MM-DD') as report_date, char_length(schedule_text) as chars from shared_days where report_date = any(${dates}::date[])`;
  const [{ drafts }] = await sql<{ drafts: number }[]>`
    select count(*)::int as drafts from drafts
    where report_date = any(${dates}::date[]) and exists (select 1 from jsonb_array_elements(selected_photos) e where e->>'source' = 'shared')`;
  const [{ reports }] = await sql<{ reports: number }[]>`select count(*)::int as reports from reports where report_date = any(${dates}::date[])`;

  for (const d of dates) {
    const n = (kind: string) => files.filter((f) => f.report_date === d && f.kind === kind).length;
    const m = (kind: string) => materials.filter((f) => f.report_date === d && f.kind === kind).length;
    const day = days.find((x) => x.report_date === d);
    console.log(`${d}: 일정 텍스트 ${day ? `${day.chars}자` : "없음"} · 일정 이미지 ${n("schedule_image")} · 사진 ${n("photo")} · 일정 문서 ${m("schedule")} · 교육자료 ${m("education")}`);
  }
  if (drafts) console.log(`주의: 이 날짜에 공통 사진을 고른 회사 초안 ${drafts}건이 있습니다. 지운 사진은 그 초안에서 보이지 않습니다.`);
  if (reports) console.log(`주의: 이 날짜에 이미 만든 회사 보고서 ${reports}건이 있습니다. 보고서 글은 남지만 공통 사진은 빠집니다.`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("지우려면 '삭제'를 입력하세요: ");
  rl.close();
  if (answer.trim() !== "삭제") {
    console.log("취소했습니다. 아무것도 지우지 않았습니다.");
  } else {
    // shared_files·shared_materials는 shared_days에 on delete cascade로 묶여 함께 지워진다
    await sql`delete from shared_days where report_date = any(${dates}::date[])`;
    console.log("DB에서 공통 자료를 지웠습니다.");

    const storageUrl = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!storageUrl || !key) {
      console.log("SUPABASE_URL·SUPABASE_SECRET_KEY가 없어 Storage 파일은 지우지 않았습니다.");
    } else {
      const bucket = createClient(storageUrl, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(
        process.env.SUPABASE_PHOTO_BUCKET ?? "report-storages",
      );
      // DB에 남지 않은 업로드(중간에 끊긴 원본 등)도 지우도록 날짜 폴더를 직접 나열한다
      const paths = new Set([...files.map((f) => f.storage_path), ...materials.flatMap((f) => (f.storage_path ? [f.storage_path] : []))]);
      for (const d of dates) {
        for (const folder of [`shared/${d}`, `shared/${d}/materials`]) {
          const { data, error } = await bucket.list(folder, { limit: 1000 });
          if (error) throw new Error(`${folder} 목록 실패: ${error.message}`);
          for (const o of data) if (o.id) paths.add(`${folder}/${o.name}`);
        }
      }
      const targets = [...paths];
      for (let i = 0; i < targets.length; i += 100) {
        const { error } = await bucket.remove(targets.slice(i, i + 100));
        if (error) throw new Error(`Storage 삭제 실패: ${error.message}`);
      }
      console.log(`Storage 파일 ${targets.length}개를 지웠습니다.`);
    }
  }
} finally {
  await sql.end();
}
