import { requireCompany } from "@/server/auth";
import { getCompanyProfile } from "@/server/companies";
import { db } from "@/server/db";
import { isIsoDate } from "@/server/domain/dates";
import { buildDocx } from "@/server/docx";
import { badRequest, notFound } from "@/server/http";
import { getObject } from "@/server/storage";
import { getDraft, resolvePhotos } from "@/server/workspace";

export const maxDuration = 60;

// 모바일 Safari·Chrome에서도 저장 창이 뜨도록 서버가 첨부 파일로 내려준다(FUNC-15)
export async function GET(req: Request, ctx: RouteContext<"/api/days/[date]/report/docx">) {
  const s = await requireCompany(req);
  if (s instanceof Response) return s;
  const { date } = await ctx.params;
  if (!isIsoDate(date)) return badRequest("날짜 형식이 잘못되었습니다");
  const [r] = await db()<{ body_html: string }[]>`select body_html from reports where company_id = ${s.companyId} and report_date = ${date}`;
  if (!r) return notFound();
  const refs = (await getDraft(s.companyId, date))?.selected_photos ?? [];
  const resolved = (await resolvePhotos(s.companyId, date, refs)) ?? [];
  const photos = await Promise.all(
    resolved.map(async (p) => ({ bytes: await getObject(p.storagePath), width: p.width, height: p.height, type: p.storagePath.endsWith(".png") ? ("png" as const) : ("jpg" as const) })),
  );
  const buf = await buildDocx([{ html: r.body_html, photos }]);
  const company = (await getCompanyProfile(s.companyId)).label.replace(/[\\/:*?"<>|]/g, "");
  const filename = `GMEP_일일출장보고서_${date}_${company}.docx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="report-${date}.docx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
}
