import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 버킷은 비공개로 두고 브라우저에는 서명 URL만 준다(DATA-2). 사진과 기안문·교육자료 원본을 같은 버킷에 둔다.
const SIGNED_URL_SECONDS = 3600;

let client: SupabaseClient | undefined;

function bucket() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL·SUPABASE_SECRET_KEY가 필요합니다");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client.storage.from(process.env.SUPABASE_PHOTO_BUCKET ?? "report-storages");
}

export async function putObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const { error } = await bucket().upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`사진 저장 실패: ${error.message}`);
}

export async function getObject(path: string): Promise<Uint8Array> {
  const { data, error } = await bucket().download(path);
  if (error || !data) throw new Error(`사진 읽기 실패: ${error?.message ?? path}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const { data, error } = await bucket().createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) throw new Error(`사진 주소 발급 실패: ${error.message}`);
  return new Map(data.filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl!]));
}

export async function removeObjects(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await bucket().remove(paths);
  if (error) throw new Error(`사진 삭제 실패: ${error.message}`);
}

// 원본 파일은 Vercel 함수 본문 한도를 피하려고 브라우저가 이 URL로 Storage에 직접 올린다
export async function signedUploadUrl(path: string): Promise<string> {
  const { data, error } = await bucket().createSignedUploadUrl(path);
  if (error || !data) throw new Error(`업로드 주소 발급 실패: ${error?.message ?? path}`);
  return data.signedUrl;
}

export async function signedDownloadUrl(path: string, filename: string): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(path, SIGNED_URL_SECONDS, { download: filename });
  if (error || !data) throw new Error(`다운로드 주소 발급 실패: ${error?.message ?? path}`);
  return data.signedUrl;
}
