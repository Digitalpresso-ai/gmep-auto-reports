import "server-only";
import { callModel } from "./ai";
import { db } from "./db";
import { aiModel } from "./settings";
import { getObject } from "./storage";

// 관리자가 올린 공통 사진을 한 장씩 AI로 설명한다(PHOTO-1). 설명은 보고서 본문에 쓰지 않고 사진 배치(PHOTO-2)에만 쓴다.
// 사람 이름을 추정하지 않게 하고, 화면·슬라이드·간판의 글자는 그대로 옮겨 어느 세션 사진인지 맞출 단서로 쓴다.
const PROMPT = `해외 액셀러레이팅 프로그램 현장에서 찍은 사진입니다. 이 사진을 보고서의 어느 일정·강연 옆에 둘지 고르는 데 쓸 설명을 만드세요.
- scene: 장면 한 문장(한국어, 80자 이내). 예: "강연장에서 발표자가 슬라이드를 띄우고 참가자 20여 명이 듣는 장면"
- activity: 강연·워크숍·라운드테이블·네트워킹·투어·단체사진·식사·이동·기타 중 하나
- visible_text: 화면·슬라이드·현수막·명찰 등에 보이는 글자를 원문 그대로(없으면 빈 문자열, 200자 이내)
사람의 이름·소속은 추정하지 말고, 보이지 않는 내용은 쓰지 마세요.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scene", "activity", "visible_text"],
  properties: { scene: { type: "string" }, activity: { type: "string" }, visible_text: { type: "string" } },
};

export function describeText(v: { scene?: unknown; activity?: unknown; visible_text?: unknown }): string {
  const s = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  return [s(v.activity) && `[${s(v.activity)}]`, s(v.scene), s(v.visible_text) && `화면 글자: "${s(v.visible_text)}"`].filter(Boolean).join(" ").slice(0, 2000);
}

async function describeOne(model: string, path: string): Promise<string> {
  const bytes = await getObject(path);
  const res = await callModel({
    model,
    prompt: PROMPT,
    images: [{ mediaType: path.endsWith(".png") ? "image/png" : "image/jpeg", base64: Buffer.from(bytes).toString("base64") }],
    jsonSchema: SCHEMA,
    maxTokens: 2_000,
    effort: "low",
  });
  return describeText(JSON.parse(res.text));
}

/** 그날 설명이 없는 공통 사진을 최대 limit장 설명한다. 실패한 사진은 null로 남겨 다시 시도할 수 있게 한다. */
export async function describePendingPhotos(date: string, limit: number): Promise<{ described: number; failed: number; remaining: number }> {
  const sql = db();
  const rows = await sql<{ id: string; storage_path: string }[]>`
    select id, storage_path from shared_files where report_date = ${date} and kind = 'photo' and description is null order by created_at, id limit ${limit}`;
  const model = await aiModel();
  const results = await Promise.all(
    rows.map(async (r) => {
      try {
        const description = await describeOne(model, r.storage_path);
        await sql`update shared_files set description = ${description} where id = ${r.id}`;
        return true;
      } catch (e) {
        console.error("사진 설명 실패", { id: r.id, error: e instanceof Error ? e.message : String(e) });
        return false;
      }
    }),
  );
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from shared_files where report_date = ${date} and kind = 'photo' and description is null`;
  const described = results.filter(Boolean).length;
  return { described, failed: results.length - described, remaining: n };
}
