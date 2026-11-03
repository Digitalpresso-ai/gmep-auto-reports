import { requireAdmin } from "@/server/auth";
import { ok } from "@/server/http";
import { listSharedDays } from "@/server/shared-days";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth !== true) return auth;
  return ok(await listSharedDays());
}
