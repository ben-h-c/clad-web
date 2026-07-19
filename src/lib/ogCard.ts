/**
 * Shared helpers for the OG share-card routes.
 *
 * CACHE VERSIONING — the one pattern for every card route:
 * Cards are cached twice outside the Worker (zone CDN keyed on the URL, and
 * social scrapers' own unfurl caches keyed on the og:image URL) plus once
 * inside it (caches.default). A redesign must bust all three or users keep
 * sharing yesterday's card, which is exactly what happened on 2026-07-16
 * (quiz/week served the pre-redesign card ~6h after the commit).
 *
 *  - Worker cache: ogCacheKey() folds the version into a synthetic
 *    (never-served) path segment, so bumping the constant invalidates on
 *    deploy. The query string is deliberately dropped — ?anything must not
 *    fan out satori renders (anti-DoS property the routes rely on).
 *  - CDN + scrapers: the EMITTING page appends ?v=<same constant> to the
 *    og:image URL, giving crawlers a brand-new URL.
 *
 * RULE: any card redesign bumps that card's constant here, in the same
 * commit. Route and page import the same constant so they cannot drift.
 */
export const OG_VERSIONS = {
  post: "6", // v6: lean geometry bar + word-boundary clipping
  story: "4", // v4: word-boundary clipping
  quiz: "2", // v2: teases today's actual first claim
  week: "1",
  learn: "2", // v2: page-specific chips replace scroll-bait copy
  politician: "3", // v3: Commons portrait on the share card
  bracket: "2", // v2: community social proof subhead
  bracketVotes: "1",
  students: "1",
} as const;

export function ogCacheKey(url: URL, route: string, version: string): Request {
  return new Request(url.origin + "/__og-" + route + "-v" + version + url.pathname);
}

/**
 * Word-boundary clip for card text. Raw slice() amputates mid-word
 * ("…independent recommendat…"); this backs up to the last space when one
 * exists in the final 24 chars, trims trailing punctuation, and appends an
 * ellipsis.
 */
export function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > n - 24 ? cut.slice(0, sp) : cut).trimEnd().replace(/[,;:—-]$/, "") + "…";
}
