const CORPORATE_MARK = /^\s*(?:주식회사|\(주\)|㈜)\s*|\s*(?:주식회사|\(주\)|㈜)\s*$/;

function baseName(name: string): { base: string; corporate: boolean } {
  const base = name.replace(CORPORATE_MARK, "").trim();
  return { base, corporate: base !== name.trim() };
}

export function displayName(name: string): string {
  const { base, corporate } = baseName(name);
  return corporate ? `${base}(주)` : base;
}

const collator = new Intl.Collator("ko");

export function sortForLogin<T extends { id: string; name: string }>(companies: T[]): { id: string; label: string }[] {
  return companies
    .map((c) => ({ id: c.id, label: displayName(c.name), key: baseName(c.name).base }))
    .sort((a, b) => collator.compare(a.key, b.key))
    .map(({ id, label }) => ({ id, label }));
}
