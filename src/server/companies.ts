import "server-only";
import { randomBytes } from "node:crypto";
import { hashPassword } from "./auth";
import { db } from "./db";
import { displayName, sortForLogin } from "./domain/company-name";
import { berlinDayStart } from "./domain/dates";
import type { DailyLimits } from "./domain/usage";

export type CompanyProfile = {
  id: string;
  name: string;
  label: string;
  traveler: string;
  businessIntro: string;
  proposalFilename: string | null;
  proposalChars: number;
  proposalHasOriginal: boolean;
};

export async function getCompanyProfile(companyId: string): Promise<CompanyProfile> {
  const [c] = await db()<{ id: string; name: string; traveler: string; business_intro: string; proposal_filename: string | null; proposal_chars: number; has_original: boolean }[]>`
    select id, name, traveler, business_intro, proposal_filename, char_length(proposal_text) as proposal_chars,
           (proposal_storage_path is not null) as has_original
    from companies where id = ${companyId}`;
  return {
    id: c.id,
    name: c.name,
    label: displayName(c.name),
    traveler: c.traveler,
    businessIntro: c.business_intro,
    proposalFilename: c.proposal_filename,
    proposalChars: c.proposal_chars,
    proposalHasOriginal: c.has_original,
  };
}

// ---------- 관리자 회사 관리(AUTH-9). 보고서·기안문 내용은 넣지 않는다(AUTH-10). ----------

export async function listCompaniesForAdmin() {
  // 오늘 성공한 생성·수정 횟수는 회사 화면의 남은 횟수와 같은 기준(독일 시간 하루, 성공만)으로 센다(AI-9)
  const dayStart = berlinDayStart();
  const rows = await db()<
    {
      id: string;
      name: string;
      has_password: boolean;
      must_change_password: boolean;
      locked_until: Date | null;
      daily_generate_limit: number;
      daily_revise_limit: number;
      generate_used: number;
      revise_used: number;
    }[]
  >`
    select c.id, c.name, (c.password_hash is not null) as has_password, c.must_change_password,
           case when a.locked_until > now() then a.locked_until end as locked_until,
           c.daily_generate_limit, c.daily_revise_limit,
           (select count(*)::int from ai_usage u where u.company_id = c.id and u.kind = 'generate' and u.success and u.created_at >= ${dayStart}) as generate_used,
           (select count(*)::int from ai_usage u where u.company_id = c.id and u.kind = 'revise' and u.success and u.created_at >= ${dayStart}) as revise_used
    from companies c left join login_attempts a on a.company_id = c.id`;
  const order = new Map(sortForLogin(rows).map((c, i) => [c.id, i]));
  return rows
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    .map((r) => ({
      id: r.id,
      name: r.name,
      label: displayName(r.name),
      hasPassword: r.has_password,
      mustChangePassword: r.must_change_password,
      lockedUntil: r.locked_until?.toISOString() ?? null,
      generateLimit: r.daily_generate_limit,
      reviseLimit: r.daily_revise_limit,
      generateUsed: r.generate_used,
      reviseUsed: r.revise_used,
    }));
}

export async function setCompanyLimits(id: string, l: DailyLimits): Promise<boolean> {
  const rows = await db()`update companies set daily_generate_limit = ${l.dailyGenerateLimit}, daily_revise_limit = ${l.dailyReviseLimit}, updated_at = now()
                          where id = ${id} returning id`;
  return rows.length > 0;
}

export async function setAllCompanyLimits(l: DailyLimits): Promise<void> {
  await db()`update companies set daily_generate_limit = ${l.dailyGenerateLimit}, daily_revise_limit = ${l.dailyReviseLimit}, updated_at = now()`;
}

export async function addCompany(name: string): Promise<string | null> {
  const rows = await db()<{ id: string }[]>`insert into companies (name) values (${name}) on conflict (name) do nothing returning id`;
  return rows[0]?.id ?? null;
}

export async function renameCompany(id: string, name: string): Promise<"ok" | "not_found" | "duplicate"> {
  try {
    const rows = await db()`update companies set name = ${name}, updated_at = now() where id = ${id} returning id`;
    return rows.length ? "ok" : "not_found";
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return "duplicate";
    throw e;
  }
}

// 혼동하기 쉬운 0·O·1·l·I를 뺀 문자로 초기 비밀번호를 만든다
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

const newPassword = () => Array.from(randomBytes(10), (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join("");

export async function issueInitialPassword(id: string): Promise<string | null> {
  const password = newPassword();
  const hash = await hashPassword(password);
  const sql = db();
  const ok = await sql.begin(async (tx) => {
    const rows = await tx`update companies set password_hash = ${hash}, must_change_password = true, updated_at = now() where id = ${id} returning id`;
    if (!rows.length) return false;
    await tx`delete from sessions where company_id = ${id}`;
    await tx`delete from login_attempts where company_id = ${id}`;
    return true;
  });
  return ok ? password : null;
}

// 비밀번호가 아직 없는 회사에만 발급한다. 그사이 다른 관리자가 발급한 회사는 update 조건에서 빠진다.
export async function issueMissingPasswords() {
  const sql = db();
  const targets = (await listCompaniesForAdmin()).filter((c) => !c.hasPassword);
  const issued = [];
  for (const c of targets) {
    const password = newPassword();
    const rows = await sql`update companies set password_hash = ${await hashPassword(password)}, must_change_password = true, updated_at = now()
                           where id = ${c.id} and password_hash is null returning id`;
    if (rows.length) issued.push({ id: c.id, name: c.name, label: c.label, password });
  }
  return issued;
}
