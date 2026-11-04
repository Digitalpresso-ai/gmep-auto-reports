// run.eval.ts와 revise.eval.ts가 같은 생성 입력을 쓰게 한다. 프롬프트가 바이트 단위로 같아야 수정 평가가 생성의 캐시를 읽는다.
import fs from "node:fs";
import { COMPANY, DATE, loadDay } from "./fixture";
import type { GenerateInput } from "./generators";

// 회사가 고를 법한 장수. 공통 사진 중 고르게 8장을 고른다.
const SELECT = 8;

export async function evalInput(model: string) {
  const day = await loadDay();
  const step = Math.floor(day.photos.length / SELECT);
  const selected = Array.from({ length: SELECT }, (_, i) => day.photos[i * step]);
  const photoKeys = selected.map((p) => `shared:${p.file}`);
  const input: GenerateInput = {
    model,
    photoKeys,
    scheduleImages: day.scheduleImages.map((p) => ({ mediaType: "image/jpeg" as const, base64: fs.readFileSync(p.jpgPath).toString("base64") })),
    promptInput: {
      companyName: COMPANY.name,
      traveler: COMPANY.traveler,
      businessIntro: COMPANY.businessIntro,
      date: DATE,
      proposalText: day.proposalText,
      scheduleText: day.scheduleText,
      scheduleMaterials: day.materials.filter((m) => m.kind === "schedule"),
      educationMaterials: day.materials.filter((m) => m.kind === "education"),
      notes: "",
      hasScheduleImages: day.scheduleImages.length > 0,
    },
  };
  // 운영과 다른 입력을 결과에 남긴다. 자료 폴더에 일정 이미지·일정 텍스트가 없으면 운영보다 입력이 적다.
  const inputs = {
    scheduleImages: day.scheduleImages.length,
    scheduleText: day.scheduleText.trim().length > 0,
    note: [
      day.scheduleImages.length ? "" : "자료 폴더에 일정 이미지가 없어 보내지 않음",
      day.scheduleText.trim() ? "" : "일정 텍스트 없음(EVAL_SCHEDULE_TEXT_FILE로 줄 수 있음)",
      "특이사항(notes) 비움",
    ].filter(Boolean),
  };
  return { input, selected, ignored: day.ignored, inputs };
}
