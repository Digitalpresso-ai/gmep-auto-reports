import { requireAdmin } from "@/server/auth";
import { addCompany, listCompaniesForAdmin } from "@/server/companies";
import { badRequest, fail, ok, readJson, str } from "@/server/http";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  return ok(await listCompaniesForAdmin());
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  const name = str((await readJson(req))?.name)?.trim();
  if (!name || name.length > 100) return badRequest("회사명을 100자 이내로 입력해 주세요");
  const id = await addCompany(name);
  return id ? ok({ id }, 201) : fail(409, "duplicate", "같은 이름의 회사가 이미 있습니다");
}
