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

/**
 * Agent-written summaries habitually open with scene-setting boilerplate —
 * "The segment features…", "This broadcast covers…" — which wastes the ~90
 * visible characters a SERP snippet or unfurl description gets. Strip the
 * boilerplate opener so the description leads with the actual subject; if the
 * summary doesn't match the pattern, it passes through unchanged.
 */
export function stripSummaryOpener(text: string): string {
  const stripped = text
    .replace(
      /^(?:The |This )?(?:[A-Z][\w'’.&-]*(?: [A-Z][\w'’.&-]*){0,3} )?(?:segment|broadcast|clip|video|coverage|episode|interview|panel)(?: from [^.,]{1,40})? (?:features|covers|discusses|reports(?: on)?|shows|details|examines|profiles|highlights|opens with|focuses on|is about|centers on|addresses|reviews)\s+/,
      ""
    )
    .trim();
  if (!stripped || stripped === text.trim()) return text.trim();
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}
