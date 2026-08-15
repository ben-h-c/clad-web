/**
 * Home “People in the news” strip — anyone notable in graded coverage
 * (officeholders plus other named people) and midterms race sides.
 *
 * Fast path: tag counts + race board only (no full roster × posts regex index).
 */
import type { CollectionEntry } from "astro:content";
import {
  photoForSlug,
  photoSrc,
  resolvePhotoSlug,
  wikiTitleForSlug,
} from "./politicianPhotos.ts";
import { ROSTER_SEEDS } from "../data/politicianRoster.ts";
import type { PoliticianAgg } from "./politicians.ts";
import { extractNotablePeopleFromText, mergePersonTags } from "./notablePeople.ts";
import type { RaceDef } from "./races.ts";
import { isVoteDateTbd } from "./races.ts";
import type { HomeFeatureItem } from "./homeFeatures.ts";

const OFFICE_SLUGS = new Set(ROSTER_SEEDS.map((s) => s.slug));

function recencyPoints(ageDays: number): number {
  if (ageDays <= 0.75) return 90;
  if (ageDays <= 1.5) return 75;
  if (ageDays <= 3) return 55;
  if (ageDays <= 7) return 22;
  if (ageDays <= 14) return 8;
  return 2;
}

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

/**
 * Known portrait chance: static map, live KV (with slug aliases), or wiki title.
 * Everyone still gets a proxy URL so Wikipedia-by-name can fill gaps at request time.
 */
function knownPortrait(
  slug: string,
  photoBySlug: Record<string, string>
): string | null {
  const key = resolvePhotoSlug(slug);
  const live = photoBySlug[slug] || photoBySlug[key];
  if (live) return live;
  return photoForSlug(slug);
}

function hasPortraitPath(slug: string, photoBySlug: Record<string, string>): boolean {
  if (knownPortrait(slug, photoBySlug)) return true;
  return !!wikiTitleForSlug(slug);
}

function monogramFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Fill the strip with people currently in coverage.
 * Recency first; cap officeholders so celebrities / CEOs / athletes can appear.
 */
function mentionedInHeadline(name: string, headline: string | undefined): boolean {
  if (!headline) return false;
  const n = name.toLowerCase();
  const h = headline.toLowerCase();
  if (h.includes(n)) return true;
  const parts = n.split(/\s+/).filter((w) => w.length > 3);
  return parts.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(h));
}

function pickSpotlightPeople<
  T extends {
    slug: string;
    office: boolean;
    latestAgeDays: number;
    hasPhoto: boolean;
    latestPostId: string | null;
  },
>(ranked: T[], max: number): T[] {
  const officeCap = Math.max(5, Math.ceil(max * 0.6));
  const hot = ranked.filter((c) => c.latestAgeDays <= 3);
  const warm = ranked.filter((c) => c.latestAgeDays > 3 && c.latestAgeDays <= 14);
  const cold = ranked.filter((c) => c.latestAgeDays > 14);
  const picked: T[] = [];
  const seen = new Set<string>();

  const take = (list: T[], opts: { respectCap: boolean; uniqueStory: boolean }) => {
    const usedStories = new Set(picked.map((p) => p.latestPostId).filter(Boolean));
    for (const c of list) {
      if (picked.length >= max) return;
      if (seen.has(c.slug)) continue;
      if (opts.respectCap && c.office && picked.filter((p) => p.office).length >= officeCap) {
        continue;
      }
      if (opts.uniqueStory && c.latestPostId && usedStories.has(c.latestPostId)) continue;
      seen.add(c.slug);
      if (c.latestPostId) usedStories.add(c.latestPostId);
      picked.push(c);
    }
  };

  // One face per story first, so a hearing does not consume the whole strip.
  take(
    hot.filter((c) => c.hasPhoto),
    { respectCap: true, uniqueStory: true }
  );
  take(hot, { respectCap: true, uniqueStory: true });
  take(hot, { respectCap: true, uniqueStory: false });
  take(hot, { respectCap: false, uniqueStory: false });
  take(
    warm.filter((c) => c.hasPhoto),
    { respectCap: true, uniqueStory: true }
  );
  take(warm, { respectCap: false, uniqueStory: false });
  take(cold, { respectCap: false, uniqueStory: false });
  return picked;
}

/**
 * Build media-hero slides for the politician spotlight strip.
 * Mixes (1) people with recent Clad coverage and (2) midterms race sides.
 * Portraits always go through /api/politician-photo/[slug] (static → KV → Wikipedia).
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

  const raceBySlug = new Map<string, { race: RaceDef; side: "a" | "b"; days: number | null }>();
  for (const r of opts.races || []) {
    const days = daysUntilIso(nextVoteDate(r), now);
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
    hasPhoto: boolean;
    grade: string | null;
    lean: number | null;
    latestAgeDays: number;
    office: boolean;
    latestPostId: string | null;
  };

  const bySlug = new Map<string, Cand>();

  const put = (c: Cand) => {
    const prev = bySlug.get(c.slug);
    if (!prev || c.score > prev.score) bySlug.set(c.slug, c);
  };

  for (const p of opts.politicians) {
    if (!p.slug || (p.bucket === "Coverage" && p.appearances.length === 0)) continue;
    const recent = p.appearances.filter((a) => a.publishedAt.valueOf() >= weekAgo);
    const month = p.appearances.filter((a) => a.publishedAt.valueOf() >= monthAgo);
    const raceInfo = raceBySlug.get(p.slug);

    if (recent.length === 0 && month.length === 0 && !raceInfo) continue;

    const latest = p.appearances[0];
    const latestAgeDays = latest
      ? (now.getTime() - latest.publishedAt.valueOf()) / 86_400_000
      : 999;
    const office = OFFICE_SLUGS.has(p.slug) || Boolean(raceInfo);
    const hasPhoto = hasPortraitPath(p.slug, photos) || p.name.trim().split(/\s+/).length >= 2;

    // Recency first, volume capped — otherwise a few heavily tagged officeholders
    // crowd out anyone notable who appeared once today.
    let score = recencyPoints(latestAgeDays);
    score += Math.min(recent.length, 4) * 8;
    score += Math.min(month.length, 3) * 2;
    if (hasPhoto) score += 10;
    else score -= 8;
    if (raceInfo && recent.length > 0) score += 8;
    if (mentionedInHeadline(p.name, latest?.headline)) score += 16;
    // One hearing clip is not "in the news" the way a dedicated story is.
    if (
      recent.length <= 1 &&
      /questions|hearing|grills|presses|testifies|markup/i.test(latest?.headline ?? "")
    ) {
      score -= 22;
    }

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

    put({
      slug: p.slug,
      name: p.name,
      score,
      kicker,
      body,
      href: `/politicians/${p.slug}/`,
      hasPhoto,
      grade: opts.locked ? null : p.personGrade ?? p.avgGrade,
      lean: opts.locked ? null : p.personLean ?? p.avgLean,
      latestAgeDays,
      office,
      latestPostId: latest?.id ?? null,
    });
  }

  for (const [slug, info] of raceBySlug) {
    if (bySlug.has(slug)) continue;
    const side = info.race[info.side];
    if (!side?.name) continue;
    const hasPhoto = hasPortraitPath(slug, photos);
    const days = info.days;
    const kicker =
      days != null && days >= 0 && days <= 60 ? `Midterms · ${days}d` : "Midterms 2026";
    put({
      slug,
      name: side.name,
      score: 6 + (hasPhoto ? 8 : 0) + (days != null && days >= 0 && days <= 90 ? 4 : 0),
      kicker,
      body: clip(
        `${info.race.office || "Race"}${info.race.state ? ` · ${info.race.state}` : ""} — on the ballot board.`,
        160
      ),
      href: `/politicians/${slug}/`,
      hasPhoto,
      grade: null,
      lean: null,
      latestAgeDays: 999,
      office: true,
      latestPostId: null,
    });
  }

  const ranked = [...bySlug.values()].sort(
    (a, b) => b.score - a.score || a.latestAgeDays - b.latestAgeDays || a.name.localeCompare(b.name)
  );
  const picked = pickSpotlightPeople(ranked, max);

  return picked.map((c) => {
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
      secondaryCta: "All people",
      variant: c.kicker.startsWith("Midterms") ? "midterms" : "topic",
      image: photoSrc(c.slug),
      monogram: monogramFromName(c.name),
    } satisfies HomeFeatureItem;
  });
}

/**
 * Fast home-only politician list: frontmatter tags on recent posts only.
 * Avoids buildPoliticianIndex (roster × posts regex) which is too heavy for /.
 */
export function lightPoliticianAggsFromPosts(
  posts: CollectionEntry<"posts">[]
): PoliticianAgg[] {
  type Row = {
    name: string;
    slug: string;
    appearances: PoliticianAgg["appearances"];
  };
  const bySlug = new Map<string, Row>();

  for (const p of posts) {
    if (p.data.draft) continue;
    const tags = mergePersonTags(
      p.data.politicians,
      extractNotablePeopleFromText({
        headline: p.data.headline,
        summary: p.data.summary,
        topics: p.data.topics,
      })
    );
    if (!tags.length) continue;
    const appearance = {
      id: p.id,
      headline: p.data.headline,
      publishedAt: p.data.publishedAt,
      sourceTitle: p.data.sourceTitle ?? null,
      letterGrade: p.data.letterGrade ?? null,
      factualityScore:
        typeof p.data.factualityScore === "number" ? p.data.factualityScore : null,
      leanScore: typeof p.data.leanScore === "number" ? p.data.leanScore : null,
    };
    for (const tag of tags) {
      const slug = String(tag.slug || "").trim();
      if (!slug) continue;
      let row = bySlug.get(slug);
      if (!row) {
        row = {
          name: String(tag.name || slug).trim() || slug,
          slug,
          appearances: [],
        };
        bySlug.set(slug, row);
      }
      if (!row.appearances.some((a) => a.id === p.id)) {
        row.appearances.push(appearance);
      }
    }
  }

  const out: PoliticianAgg[] = [];
  for (const row of bySlug.values()) {
    row.appearances.sort(
      (a, b) => b.publishedAt.valueOf() - a.publishedAt.valueOf()
    );
    out.push({
      name: row.name,
      slug: row.slug,
      bucket: "Coverage",
      appearances: row.appearances,
      personGrade: null,
      personFactuality: null,
      personLean: null,
      personLeanRationale: null,
      personGradeRationale: null,
      coverageGrade: null,
      coverageFactuality: null,
      coverageLean: null,
      avgGrade: null,
      avgFactuality: null,
      avgLean: null,
    });
  }
  return out.sort(
    (a, b) => b.appearances.length - a.appearances.length || a.name.localeCompare(b.name)
  );
}
