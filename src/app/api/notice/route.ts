import { ok } from "@/server/http";
import { programNotice } from "@/server/settings";

export async function GET() {
  return ok(await programNotice());
}
