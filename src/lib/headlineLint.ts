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
  // Track C — extra verdict-in-headline patterns that slipped past the original set.
  /\b(disproved|refuted|debunked)\b/i,
  /\b(untrue|not true|not accurate)\b/i,
  /\b(verified true|proven false)\b/i,
  /\bgrades?\s+[A-F][+-]?\b/i,
  /\bfactuality\s+\d+\b/i,
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

/**
 * Style advisory (separate from the verdict lint above, which is a
 * correctness flag): flat "meta" verbs describe the act of broadcasting
 * instead of the news — "X examines Y", "Panel discusses Z" — and made up
 * ~24% of the corpus before the prompt gained its energy counterweight.
 * These warn the editor toward a rewrite; they never block.
 */
export const FLAT_VERBS: RegExp[] = [
  /\bexamines?\b/i,
  /\bcovers?\b/i,
  /\bdetails?\b/i,
  /\breports? on\b/i,
  /\bdiscuss(?:es)?\b/i,
  /\bhighlights?\b/i,
  /\breviews?\b/i,
  /\boutlines?\b/i,
  /\bcomments? on\b/i,
  /\breflects? on\b/i,
  /\bexplores?\b/i,
  /\baddresses\b/i,
];

/** Returns the matched flat verbs (empty array = headline reads news-first). */
export function lintHeadlineStyle(headline: string): string[] {
  const out: string[] = [];
  for (const re of FLAT_VERBS) {
    const m = (headline || "").match(re);
    if (m && m[0] && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}
