import { db } from "@/server/db";
import { sortForLogin } from "@/server/domain/company-name";
import { ok } from "@/server/http";

export async function GET() {
  const rows = await db()<{ id: string; name: string }[]>`select id, name from companies`;
  return ok(sortForLogin(rows));
}
