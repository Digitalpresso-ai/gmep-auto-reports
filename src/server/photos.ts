import "server-only";
import { randomUUID } from "node:crypto";
import { putObject } from "./storage";

// Vercel 함수 요청 본문 한도(4.5MB) 안에서 사진 한 장씩 받는다. 브라우저가 1,100px로 줄여 보낸다(FUNC-6).
const MAX_BYTES = 4 * 1024 * 1024;
// Word 변환(docx)이 JPG·PNG만 넣을 수 있어 두 형식만 받는다. 브라우저가 JPG로 바꿔 올린다.
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };
const MAX_SIDE = 4000;

export type UploadedImage = { storagePath: string; filename: string; width: number; height: number };

export async function storeUploadedImage(form: FormData, folder: string): Promise<UploadedImage | string> {
  const file = form.get("file");
  if (!(file instanceof Blob)) return "사진 파일이 없습니다";
  const ext = TYPES[file.type];
  if (!ext) return "JPG·PNG 사진만 올릴 수 있습니다";
  if (file.size > MAX_BYTES) return "사진이 너무 큽니다(4MB 이하)";
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= MAX_SIDE)) return "사진 크기 정보가 잘못되었습니다";
  const filename = (file instanceof File && file.name ? file.name : `photo.${ext}`).slice(0, 200);
  const storagePath = `${folder}/${randomUUID()}.${ext}`;
  await putObject(storagePath, new Uint8Array(await file.arrayBuffer()), file.type);
  return { storagePath, filename, width, height };
}
