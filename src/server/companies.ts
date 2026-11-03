import "server-only";
import { db } from "./db";
import { displayName } from "./domain/company-name";

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
