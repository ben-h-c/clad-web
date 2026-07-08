import { nyDateParts } from "~/lib/dateline";

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

// Slug dates use the newsroom's Eastern clock (same as the dateline) so the
// URL prefix matches the displayed publish date. Existing slugs are permalinks
// — this affects future posts only.
export function datedSlug(headline: string, when: Date = new Date()): string {
  const { y, m, d } = nyDateParts(when);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}-${slugify(headline)}`;
}
