// Meta-description hygiene: summaries are written for the page body and can run
// 500+ chars with embedded newlines, which leaks into <meta name="description">
// and og:description as mid-word cuts. Collapse whitespace and truncate on a
// word boundary so serps/unfurlers get a clean sentence fragment.
export function metaDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  let cut = clean.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  if (sp > max * 0.6) cut = cut.slice(0, sp);
  return cut.replace(/[,;:.\-–—]+$/, "") + "…";
}
