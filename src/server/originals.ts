import "server-only";
import { randomUUID } from "node:crypto";

// 기안문·교육자료 원본 보관(FUNC-1·FUNC-5). 버킷의 파일 크기 한도와 허용 MIME도 이에 맞춰야 올라간다.
export const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024;
const EXT = ["pdf", "docx", "pptx", "txt", "md"];

export function originalPath(folder: string, filename: unknown, size: unknown): string | { error: string } {
  if (typeof filename !== "string" || !filename.trim()) return { error: "파일 이름이 없습니다" };
  const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
  if (!EXT.includes(ext)) return { error: "PDF·DOCX·PPTX·텍스트 파일만 보관할 수 있습니다" };
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0 || size > MAX_ORIGINAL_BYTES) return { error: "원본 파일은 50MB 이하만 보관할 수 있습니다" };
  return `${folder}/${randomUUID()}.${ext}`;
}

// 브라우저가 보낸 경로가 이 회사·날짜 폴더 안에서 발급한 모양인지 본다. DB 제약도 같은 규칙을 검사한다.
export function isOwnedPath(path: unknown, folder: string): path is string {
  return typeof path === "string" && new RegExp(`^${folder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[0-9a-f-]{36}\\.(pdf|docx|pptx|txt|md)$`).test(path);
}
