/**
 * Politician index for /politicians/*.
 *
 * Membership sources (merged):
 *  1. Full officeholder roster (Congress, governors, SCOTUS, executive) —
 *     `src/data/politicianRoster.ts`, generated from public data.
 *  2. Optional post frontmatter `politicians: [{ name, slug }]` (agent/editor).
 *  3. Alias match of seeds against headline + topics + summary.
 *
 * Every roster seed gets a directory card even with zero graded appearances
 * so the map of power is complete; grades fill in as coverage lands.
 *
 * Aggregate grades/leans are computed here and gated in the page (same hybrid
 * access model as outlets). OG cards use public fields only.
 */
import type { CollectionEntry } from "astro:content";
import { ROSTER_SEEDS } from "../data/politicianRoster.ts";
import { gradeToGpa, gpaToGrade, leanScoreOf } from "./topics.ts";

/** Index / filter grouping for the politicians directory. */
export type RaceBucket =
  | "Senate 2026"
  | "Senate"
  | "House"
  | "Governor"
  | "Executive"
  | "Supreme Court"
  | "International"
  | "Other";

export interface PoliticianSeed {
  name: string;
  slug: string;
  /** Short race / office label shown on cards. */
  race?: string;
  bucket?: RaceBucket;
  /** Case-insensitive aliases. Prefer multi-word; single tokens need word bounds. */
  aliases: string[];
}

/** Full roster + contenders + international coverage figures. */
export const POLITICIAN_SEEDS: PoliticianSeed[] = ROSTER_SEEDS as PoliticianSeed[];

const BUCKET_ORDER: RaceBucket[] = [
  "Executive",
  "Senate 2026",
  "Senate",
  "House",
  "Governor",
  "Supreme Court",
  "International",
  "Other",
];

export interface PoliticianAppearance {
  id: string;
  headline: string;
  publishedAt: Date;
  sourceTitle: string | null;
  letterGrade: string | null;
  factualityScore: number | null;
  leanScore: number | null;
}

export interface PoliticianAgg {
  name: string;
  slug: string;
  race?: string;
  bucket: RaceBucket;
  appearances: PoliticianAppearance[];
  avgGrade: string | null;
  avgFactuality: number | null;
  avgLean: number | null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesAlias(haystack: string, alias: string): boolean {
  const a = alias.trim();
  if (!a) return false;
  // Multi-word / hyphen / initial: substring match (case-insensitive haystack).
  if (/\s/.test(a) || a.includes("-") || a.includes(".")) {
    return haystack.includes(a.toLowerCase());
  }
  // Single token: word boundary only.
  const re = new RegExp(`\\b${escapeRe(a)}\\b`, "i");
  return re.test(haystack);
}

function textBlob(p: CollectionEntry<"posts">): string {
  const d = p.data;
  return [d.headline, d.summary, ...(d.topics ?? []), d.sourceTitle ?? ""].join(" \n ").toLowerCase();
}

function appearanceFrom(p: CollectionEntry<"posts">): PoliticianAppearance {
  const d = p.data;
  return {
    id: p.id,
    headline: d.headline,
    publishedAt: d.publishedAt,
    sourceTitle: d.sourceTitle ?? null,
    letterGrade: d.letterGrade ?? null,
    factualityScore: typeof d.factualityScore === "number" ? d.factualityScore : null,
    leanScore: leanScoreOf(d),
  };
}

function normalizeBucket(b?: string): RaceBucket {
  if (!b) return "Other";
  if ((BUCKET_ORDER as string[]).includes(b)) return b as RaceBucket;
  // Legacy seeds / FM
  if (b === "U.S. leadership") return "Executive";
  if (b === "Congress") return "House";
  return "Other";
}

const seedBySlug = new Map(POLITICIAN_SEEDS.map((s) => [s.slug, s]));

/** Build the full politician index from a posts collection. */
export function buildPoliticianIndex(posts: CollectionEntry<"posts">[]): PoliticianAgg[] {
  const bySlug = new Map<
    string,
    { name: string; slug: string; race?: string; bucket: RaceBucket; posts: Map<string, CollectionEntry<"posts">> }
  >();

  const ensure = (slug: string, name: string, race?: string, bucket?: RaceBucket) => {
    let row = bySlug.get(slug);
    if (!row) {
      const seed = seedBySlug.get(slug);
      row = {
        name: name || seed?.name || slug,
        slug,
        race: race || seed?.race,
        bucket: normalizeBucket(bucket || seed?.bucket),
        posts: new Map(),
      };
      bySlug.set(slug, row);
    } else {
      if (race && !row.race) row.race = race;
      if (bucket && row.bucket === "Other") row.bucket = normalizeBucket(bucket);
    }
    return row;
  };

  // Always materialize the full roster so cards exist before first coverage.
  for (const seed of POLITICIAN_SEEDS) {
    ensure(seed.slug, seed.name, seed.race, seed.bucket);
  }

  for (const p of posts) {
    if (p.data.draft) continue;
    const blob = textBlob(p);

    for (const tag of p.data.politicians ?? []) {
      const slug = tag.slug.trim();
      if (!slug) continue;
      ensure(slug, tag.name.trim() || slug).posts.set(p.id, p);
    }

    for (const seed of POLITICIAN_SEEDS) {
      if (seed.aliases.some((a) => matchesAlias(blob, a))) {
        ensure(seed.slug, seed.name, seed.race, seed.bucket).posts.set(p.id, p);
      }
    }
  }

  const out: PoliticianAgg[] = [];
  for (const row of bySlug.values()) {
    const appearances = [...row.posts.values()]
      .map(appearanceFrom)
      .sort((a, b) => b.publishedAt.valueOf() - a.publishedAt.valueOf());

    const gpas = appearances.map((a) => gradeToGpa(a.letterGrade ?? undefined)).filter((n): n is number => n != null);
    const scores = appearances.map((a) => a.factualityScore).filter((n): n is number => n != null);
    const leans = appearances.map((a) => a.leanScore).filter((n): n is number => n != null);

    out.push({
      name: row.name,
      slug: row.slug,
      race: row.race,
      bucket: row.bucket,
      appearances,
      avgGrade: gpas.length ? gpaToGrade(gpas.reduce((a, b) => a + b, 0) / gpas.length) : null,
      avgFactuality: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      avgLean: leans.length ? Math.round(leans.reduce((a, b) => a + b, 0) / leans.length) : null,
    });
  }

  // Covered first, then A–Z within the same count.
  return out.sort(
    (a, b) =>
      b.appearances.length - a.appearances.length || a.name.localeCompare(b.name)
  );
}

export function findPolitician(posts: CollectionEntry<"posts">[], slug: string): PoliticianAgg | null {
  // Prefer full index (includes empty roster cards).
  const fromIndex = buildPoliticianIndex(posts).find((p) => p.slug === slug);
  if (fromIndex) return fromIndex;
  const seed = seedBySlug.get(slug);
  if (!seed) return null;
  return {
    name: seed.name,
    slug: seed.slug,
    race: seed.race,
    bucket: normalizeBucket(seed.bucket),
    appearances: [],
    avgGrade: null,
    avgFactuality: null,
    avgLean: null,
  };
}

/** Explicit FM tag shape written on publish / agent approve. */
export interface PoliticianTag {
  name: string;
  slug: string;
}

/**
 * Deterministic tagger for new drafts/publishes: match seed aliases against
 * headline + summary + assessment + topics. Prefer this over asking the model
 * so slugs stay canonical and stable.
 */
export function tagPoliticiansFromText(parts: {
  headline?: string;
  summary?: string;
  assessment?: string;
  topics?: string[];
  keyMomentClaims?: string[];
}): PoliticianTag[] {
  const hay = [
    parts.headline ?? "",
    parts.summary ?? "",
    parts.assessment ?? "",
    ...(parts.topics ?? []),
    ...(parts.keyMomentClaims ?? []),
  ]
    .join(" \n ")
    .toLowerCase();
  if (!hay.trim()) return [];
  const out: PoliticianTag[] = [];
  const seen = new Set<string>();
  for (const seed of POLITICIAN_SEEDS) {
    if (!seed.aliases.some((a) => matchesAlias(hay, a))) continue;
    if (seen.has(seed.slug)) continue;
    seen.add(seed.slug);
    out.push({ name: seed.name, slug: seed.slug });
  }
  return out.slice(0, 8);
}

/** Group for the index page, stable bucket order. */
export function groupPoliticiansByBucket(list: PoliticianAgg[]): { bucket: RaceBucket; items: PoliticianAgg[] }[] {
  const map = new Map<RaceBucket, PoliticianAgg[]>();
  for (const p of list) {
    const b = normalizeBucket(p.bucket);
    if (!map.has(b)) map.set(b, []);
    map.get(b)!.push(p);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((bucket) => ({
    bucket,
    items: (map.get(bucket) ?? []).sort(
      (a, b) => b.appearances.length - a.appearances.length || a.name.localeCompare(b.name)
    ),
  }));
}
