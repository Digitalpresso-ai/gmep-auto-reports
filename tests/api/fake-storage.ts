// Supabase Storage 대신 쓰는 메모리 저장소. vi.mock("@/server/storage", () => import("./fake-storage"))로 바꾼다.
export const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

export async function putObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  objects.set(path, { bytes, contentType });
}

export async function getObject(path: string): Promise<Uint8Array> {
  const o = objects.get(path);
  if (!o) throw new Error(`없는 객체: ${path}`);
  return o.bytes;
}

export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  return new Map(paths.map((p) => [p, `https://storage.test/signed/${p}?token=t`]));
}

export async function removeObjects(paths: string[]): Promise<void> {
  for (const p of paths) objects.delete(p);
}
