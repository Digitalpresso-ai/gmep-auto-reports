import { requireAdmin } from "@/server/auth";
import { setAllCompanyLimits } from "@/server/companies";
import { parseDailyLimits } from "@/server/domain/usage";
import { badRequest, ok, readJson } from "@/server/http";

// 모든 회사에 같은 하루 생성·수정 한도를 적용한다(AI-9)
export async function PUT(req: Request) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  const limits = parseDailyLimits(await readJson(req));
  if (!limits) return badRequest("하루 생성·수정 횟수를 0~100 사이 정수로 입력해 주세요");
  await setAllCompanyLimits(limits);
  return ok({ ok: true });
}
