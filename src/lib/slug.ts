export function slugify(input: string): string {
  let s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-");
  // Truncate on a word boundary so slugs never cut mid-word. Existing content
  // files are permalinks — this affects future posts only.
  if (s.length > 80) {
    s = s.slice(0, 80);
    const i = s.lastIndexOf("-");
    if (i >= 20) s = s.slice(0, i);
  }
  return s.replace(/-+$/, "");
}

export function datedSlug(headline: string, when: Date = new Date()): string {
  const y = when.getUTCFullYear();
  const m = String(when.getUTCMonth() + 1).padStart(2, "0");
  const d = String(when.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}-${slugify(headline)}`;
}
