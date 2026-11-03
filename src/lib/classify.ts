// 관리자 ZIP 자동 분류(FUNC-3). 일정 이름 패턴은 프로토타입 isSchedName()과 같다.
// 일정표를 사진으로 찍어 보내는 경우가 있어, 일정 이름의 이미지는 사진이 아니라 일정 이미지로 둔다.

export type FileKind = "photo" | "schedule_image" | "schedule" | "education" | "ignore";

const IMAGE = ["png", "jpg", "jpeg", "webp", "gif", "heic", "heif"];
const DOCUMENT = ["pdf", "pptx", "docx", "txt", "md"];
const SCHEDULE_NAME = /일정|스케줄|schedule|agenda|timetable|program\s*brief|briefing/i;

export const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

export function classifyFile(name: string): FileKind {
  if (name.startsWith(".")) return "ignore";
  const ext = extOf(name);
  if (IMAGE.includes(ext)) return SCHEDULE_NAME.test(name) ? "schedule_image" : "photo";
  if (DOCUMENT.includes(ext)) return SCHEDULE_NAME.test(name) ? "schedule" : "education";
  return "ignore";
}
