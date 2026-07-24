/**
 * Home “People in the news” strip — politicians hot in graded coverage
 * and/or appearing on the midterms race board.
 */
import type { CollectionEntry } from "astro:content";
import { POLITICIAN_PHOTOS } from "./politicianPhotos.ts";
import type { PoliticianAgg } from "./politicians.ts";
import type { RaceDef } from "./races.ts";
import { isVoteDateTbd } from "./races.ts";
import { displayableThumb } from "./imagePolicy.ts";
import type { HomeFeatureItem } from "./homeFeatures.ts";

function clip(s: string, n: number): string {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).trimEnd() + "…";
}

function daysUntilIso(iso: string | undefined, now: Date): number | null {
  if (!iso || isVoteDateTbd(iso)) return null;
  const t = Date.parse(iso.includes("T") ? iso : `${iso}T12:00:00Z`);
  if (Number.isNaN(t)) return null;
  return Math.round((t - now.getTime()) / 86_400_000);
}

/** Next published vote date on a race. */
function nextVoteDate(r: RaceDef): string | undefined {
  if (r.nextVoteDate && !isVoteDateTbd(r.nextVoteDate)) return r.nextVoteDate;
  return undefined;
}

function photoFor(
  slug: string,
  photoBySlug: Record<string, string>
): string | null {
  const live = photoBySlug[slug];
  if (live) return live;
  return POLITICIAN_PHOTOS[slug] || null;
}

/**
 * Build media-hero slides for the politician spotlight strip.
 * Mixes (1) people with recent Clad coverage and (2) midterms race sides.
 */
export function buildPoliticianSpotlightItems(opts: {
  politicians: PoliticianAgg[];
  photoBySlug?: Record<string, string>;
  races?: RaceDef[] | null;
  postsById?: Map<string, CollectionEntry<"posts">>;
  now?: Date;
  max?: number;
  locked?: boolean;
}): HomeFeatureItem[] {
  const now = opts.now ?? new Date();
  const max = Math.max(4, Math.min(12, opts.max ?? 10));
  const photos = opts.photoBySlug || {};
  const weekMs = 7 * 86_400_000;
  const monthMs = 30 * 86_400_000;
  const weekAgo = now.getTime() - weekMs;
  const monthAgo = now.getTime() - monthMs;

  // Slug → upcoming race label (for kickers / boost)
  const raceBySlug = new Map<string, { race: RaceDef; side: "a" | "b"; days: number | null }>();
  for (const r of opts.races || []) {
    const days = daysUntilIso(nextVoteDate(r), now);
    // Skip long-past races; keep TBD and future/near
    if (days != null && days < -14) continue;
    for (const side of ["a", "b"] as const) {
      const s = r[side];
      if (!s?.slug) continue;
      const prev = raceBySlug.get(s.slug);
      if (!prev || (days != null && (prev.days == null || days < prev.days))) {
        raceBySlug.set(s.slug, { race: r, side, days });
      }
    }
  }

  type Cand = {
    slug: string;
    name: string;
    score: number;
    kicker: string;
    body: string;
    href: string;
    image: string | null;
    grade: string | null;
    lean: number | null;
  };

  const bySlug = new Map<string, Cand>();

  const put = (c: Cand) => {
    const prev = bySlug.get(c.slug);
    if (!prev || c.score > prev.score) bySlug.set(c.slug, c);
  };

  for (const p of opts.politicians) {
    if (!p.slug || p.bucket === "Coverage" && p.appearances.length === 0) continue;
    const recent = p.appearances.filter((a) => a.publishedAt.valueOf() >= weekAgo);
    const month = p.appearances.filter((a) => a.publishedAt.valueOf() >= monthAgo);
    const raceInfo = raceBySlug.get(p.slug);

    // Need a signal: recent coverage OR on the ballot board
    if (recent.length === 0 && month.length === 0 && !raceInfo) continue;

    let score = 0;
    score += recent.length * 12;
    score += month.length * 2;
    if (raceInfo) {
      score += 18;
      if (raceInfo.days != null && raceInfo.days >= 0 && raceInfo.days <= 90) {
        score += Math.max(0, 40 - raceInfo.days / 3);
      } else if (raceInfo.days == null) {
        score += 8; // TBD still midterms-relevant
      }
    }
    // Prefer people we can show a face for
    const portrait = photoFor(p.slug, photos);
    if (portrait) score += 6;

    const latest = p.appearances[0];
    let body = latest
      ? clip(latest.headline, 160)
      : p.race
        ? clip(p.race, 160)
        : `${p.bucket} · open report card`;

    let kicker = "In the news";
    if (raceInfo) {
      const office = raceInfo.race.office || raceInfo.race.id;
      kicker =
        raceInfo.days != null && raceInfo.days >= 0 && raceInfo.days <= 60
          ? `Midterms · ${raceInfo.days}d`
          : "Midterms 2026";
      if (!latest) {
        body = clip(
          `${office}${raceInfo.race.state ? ` · ${raceInfo.race.state}` : ""} — on the ballot board.`,
          160
        );
      }
    } else if (recent.length > 0) {
      kicker = recent.length === 1 ? "Today · Covered" : `${recent.length} reports · 7d`;
    } else if (month.length > 0) {
      kicker = "This month";
    }

    // Prefer portrait; fall back to latest post still
    let image = portrait;
    if (!image && latest && opts.postsById) {
      const post = opts.postsById.get(latest.id);
      image = displayableThumb(post?.data.thumbnail) ?? null;
    }

    put({
      slug: p.slug,
      name: p.name,
      score,
      kicker,
      body,
      href: `/politicians/${p.slug}/`,
      image,
      grade: opts.locked ? null : p.personGrade ?? p.avgGrade,
      lean: opts.locked ? null : p.personLean ?? p.avgLean,
    });
  }

  // Race sides not yet in politician index (candidates without coverage)
  for (const [slug, info] of raceBySlug) {
    if (bySlug.has(slug)) continue;
    const side = info.race[info.side];
    if (!side?.name) continue;
    const portrait = photoFor(slug, photos);
    const days = info.days;
    const kicker =
      days != null && days >= 0 && days <= 60 ? `Midterms · ${days}d` : "Midterms 2026";
    put({
      slug,
      name: side.name,
      score: 16 + (portrait ? 6 : 0) + (days != null && days >= 0 && days <= 90 ? 20 : 0),
      kicker,
      body: clip(
        `${info.race.office || "Race"}${info.race.state ? ` · ${info.race.state}` : ""} — on the ballot board.`,
        160
      ),
      href: `/politicians/${slug}/`,
      image: portrait,
      grade: null,
      lean: null,
    });
  }

  const ranked = [...bySlug.values()].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name)
  );

  return ranked.slice(0, max).map((c) => {
    const leanBit =
      !opts.locked && typeof c.lean === "number"
        ? Math.abs(c.lean) < 5
          ? " · Centered"
          : ` · ${Math.abs(c.lean)}% ${c.lean > 0 ? "Right" : "Left"}`
        : "";
    const gradeBit = !opts.locked && c.grade ? `Grade ${c.grade}${leanBit}` : leanBit.replace(/^ · /, "");
    const bodyExtra = gradeBit ? `${c.body} · ${gradeBit}` : c.body;

    return {
      id: `pol-${c.slug}`,
      kicker: c.kicker,
      title: c.name,
      body: clip(bodyExtra, 200),
      href: c.href,
      cta: "Open report card",
      secondaryHref: "/politicians/",
      secondaryCta: "All politicians",
      variant: c.kicker.startsWith("Midterms") ? "midterms" : "topic",
      // Same-origin proxy when we have a known portrait (avoids hotlink quirks)
      image: c.image
        ? photos[c.slug] || POLITICIAN_PHOTOS[c.slug]
          ? `/api/politician-photo/${c.slug}`
          : c.image
        : null,
    } satisfies HomeFeatureItem;
  });
}
