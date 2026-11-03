import { requireCompany } from "@/server/auth";
import { db } from "@/server/db";
import { notFound, ok } from "@/server/http";
import { signedDownloadUrl } from "@/server/storage";

// 기안문 원본은 그 회사만 내려받는다(AUTH-8)
export async function GET(req: Request) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const [c] = await db()<{ proposal_storage_path: string | null; proposal_filename: string | null }[]>`
    select proposal_storage_path, proposal_filename from companies where id = ${s.companyId}`;
  if (!c.proposal_storage_path) return notFound();
  return ok({ url: await signedDownloadUrl(c.proposal_storage_path, c.proposal_filename ?? "기안문") });
}
