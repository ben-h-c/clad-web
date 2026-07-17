/**
 * The Morning Quiz — deterministic daily question selection.
 *
 * Shared by the quiz page (src/pages/quiz.astro) and its OG card route
 * (src/pages/og/quiz/[date].png.ts) so the card can tease the quiz's actual
 * first claim and be GUARANTEED to match the page. Selection is keyed to the
 * Eastern calendar day: same date in → same five questions out.
 *
 * The 48h recency cutoff is anchored to the END of dateISO's Eastern day —
 * never Date.now() — because the card is rendered once and edge-cached for
 * the whole day. An end-of-day anchor is the most conservative instant the
 * page can ever compute during that day, so a claim on the day-cached card is
 * never missing from the live page.
 */

export interface QuizQuestion {
  n: number;
  claim: string;
  verdict: string;
  note: string;
  slug: string;
  source: string;
}

/** Structural subset of CollectionEntry<"posts"> the selection needs. */
interface QuizSourcePost {
  id: string;
  data: {
    draft: boolean;
    type: string;
    publishedAt: Date;
    sourceTitle?: string | undefined;
    keyMoments: { claim: string; verdict: string; note: string }[];
  };
}

// FNV-1a — tiny, stable, good enough to shuffle a daily quiz.
function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Eastern (America/New_York) UTC offset in hours at the given instant —
 *  EST 5 / EDT 4 — via Intl so DST needs no table. */
function easternOffsetHours(atMs: number): number {
  try {
    const tz = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date(atMs))
      .find((p) => p.type === "timeZoneName")?.value;
    const m = /GMT([+-]\d+)/.exec(tz ?? "");
    if (m) return -Number(m[1]);
  } catch {
    /* fall through to EST */
  }
  return 5;
}

/** Epoch ms of the end of dateISO's ("YYYY-MM-DD") Eastern calendar day. */
function endOfEasternDay(dateISO: string): number {
  const [y = 0, mo = 1, d = 1] = dateISO.split("-").map(Number);
  // Midnight UTC at the start of the NEXT calendar day, shifted to UTC by the
  // Eastern offset in effect that evening.
  const naive = Date.UTC(y, mo - 1, d + 1);
  return naive + easternOffsetHours(naive) * 3_600_000;
}

/**
 * Pick the five questions for dateISO's quiz. `posts` is the posts collection
 * (drafts are excluded here regardless of the caller's filter). Deterministic:
 * ordering, pool choice, and key-moment choice depend only on posts + dateISO.
 */
export function pickQuizQuestions(posts: readonly QuizSourcePost[], dateISO: string): QuizQuestion[] {
  const broadcasts = posts
    .filter((p) => !p.data.draft && p.data.type === "broadcast" && p.data.keyMoments.length > 0)
    .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
  const cutoff = endOfEasternDay(dateISO) - 48 * 60 * 60 * 1000;
  const recent = broadcasts.filter((p) => p.data.publishedAt.valueOf() >= cutoff);
  const pool = recent.length >= 5 ? recent : broadcasts.slice(0, 10);

  return [...pool]
    .sort((a, b) => fnv(dateISO + a.id) - fnv(dateISO + b.id))
    .slice(0, 5)
    .map((p, i) => {
      const km = p.data.keyMoments[fnv(dateISO + p.id + "km") % p.data.keyMoments.length]!;
      return {
        n: i + 1,
        claim: km.claim,
        verdict: km.verdict,
        note: km.note,
        slug: p.id,
        source: p.data.sourceTitle ?? "a news broadcast",
      };
    });
}
