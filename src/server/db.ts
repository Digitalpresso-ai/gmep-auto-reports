import "server-only";
import postgres, { type Sql } from "postgres";

let client: Sql | undefined;

export function db(): Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL이 필요합니다");
    client = postgres(url, {
      // Supabase transaction pooler는 prepared statement를 지원하지 않는다
      prepare: false,
      // 이 pooler에서 새 연결에 쿼리를 여러 개 이어 보내면 응답이 오지 않았다(2026-11-03 재현).
      // 한 연결에 하나씩만 보내고, 연결 직후 배열 타입 조회도 하지 않는다. 배열 매개변수는 SQL에서 ::uuid[]처럼 형을 적는다.
      max_pipeline: 1,
      fetch_types: false,
      // Vercel 함수 하나가 동시 요청을 받을 때 쓸 연결 수. pooler 쪽 연결이라 적게 둔다.
      max: 3,
      // 멈춘 연결이나 대기열이 요청을 붙잡지 않도록 실패로 끝낸다
      connect_timeout: 10,
      queue_timeout: 20,
      // 함수가 멈췄다 다시 깨어날 때 끊긴 소켓을 쓰지 않도록 쉬는 연결을 닫는다
      idle_timeout: 20,
      onnotice: () => {},
    });
  }
  return client;
}

export async function closeDb(): Promise<void> {
  await client?.end();
  client = undefined;
}
