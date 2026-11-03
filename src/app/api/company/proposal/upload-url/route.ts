import { requireCompany } from "@/server/auth";
import { badRequest, ok, readJson } from "@/server/http";
import { originalPath } from "@/server/originals";
import { signedUploadUrl } from "@/server/storage";

export async function POST(req: Request) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const body = await readJson(req);
  const path = originalPath(`companies/${s.companyId}/proposal`, body?.filename, body?.size);
  if (typeof path !== "string") return badRequest(path.error);
  return ok({ storagePath: path, uploadUrl: await signedUploadUrl(path) });
}
