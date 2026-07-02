/**
 * Headline style lint: report headlines should describe what the broadcast
 * covered — the letter grade carries the verdict. Flag headlines that state
 * the verdict outright so the editor can rewrite before publishing.
 */
export const VERDICT_PHRASES: RegExp[] = [
  /\bholds? up\b/i,
  /\bmatch(es|ed)? official (accounts|records|data|figures)\b/i,
  /\baccurately report(s|ed)?\b/i,
  /\baccurate(ly)?\b/i,
  /\bfalse(ly)?\b/i,
  /\bmislead(s|ing)?\b/i,
  /\bdebunk(s|ed)?\b/i,
  /\bfact-?check (passes|confirms|clears)\b/i,
  /\bmostly (true|false)\b/i,
  /\bunfounded\b/i,
  /\bchecks out\b/i,
];

/** Returns the matched verdict phrases (empty array = headline is clean). */
export function lintHeadline(headline: string): string[] {
  const out: string[] = [];
  for (const re of VERDICT_PHRASES) {
    const m = (headline || "").match(re);
    if (m && m[0] && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}
