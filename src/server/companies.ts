import "server-only";
import { randomBytes } from "node:crypto";
import { hashPassword } from "./auth";
import { db } from "./db";
import { displayName, sortForLogin } from "./domain/company-name";

export type CompanyProfile = {
  id: string;
  name: string;
  label: string;
  traveler: string;
  businessIntro: string;
  proposalFilename: string | null;
  proposalChars: number;
};

export async function getCompanyProfile(companyId: string): Promise<CompanyProfile> {
  const [c] = await db()<{ id: string; name: string; traveler: string; business_intro: string; proposal_filename: string | null; proposal_chars: number }[]>`
    select id, name, traveler, business_intro, proposal_filename, char_length(proposal_text) as proposal_chars
    from companies where id = ${companyId}`;
  return {
    id: c.id,
    name: c.name,
    label: displayName(c.name),
    traveler: c.traveler,
    businessIntro: c.business_intro,
    proposalFilename: c.proposal_filename,
    proposalChars: c.proposal_chars,
  };
}

// ---------- 관리자 회사 관리(AUTH-9). 보고서·기안문 내용은 넣지 않는다(AUTH-10). ----------

export async function listCompaniesForAdmin() {
  const rows = await db()<{ id: string; name: string; has_password: boolean; must_change_password: boolean; locked_until: Date | null }[]>`
    select c.id, c.name, (c.password_hash is not null) as has_password, c.must_change_password,
           case when a.locked_until > now() then a.locked_until end as locked_until
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
    }));
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

export async function issueInitialPassword(id: string): Promise<string | null> {
  const bytes = randomBytes(10);
  const password = Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join("");
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
