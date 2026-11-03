import { requireAdmin } from "@/server/auth";
import { issueMissingPasswords } from "@/server/companies";
import { ok } from "@/server/http";

// 발급한 초기 비밀번호는 이 응답에서 한 번만 보여 주고 저장하지 않는다
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  return ok({ issued: await issueMissingPasswords() });
}
