/**
 * Politician index for /politicians/*.
 *
 * Officeholder roster (who holds power now):
 *  - Live: AGENTS KV `politicians:roster` (daily politician-roster-sync agent)
 *  - Fallback: src/data/politicianRoster.ts snapshot
 *
 * Coverage matching still uses aliases + post frontmatter tags. People who
 * appear only in coverage (not officeholders) land in "Coverage".
 *
 * Directory groups by branch / chamber: Executive, Senate, House, Governor,
 * Supreme Court — then Coverage for non-officeholders with reports.
 */
import type { CollectionEntry } from "astro:content";
import { ROSTER_SEEDS } from "../data/politicianRoster.ts";
import { getPoliticianRoster } from "./agents.ts";
import {
  getPersonProfileMap,
  resolvePersonProfile,
  type PersonProfileMap,
} from "./politicianProfiles.ts";
import { gradeToGpa, gpaToGrade, leanScoreOf } from "./topics.ts";

/** Directory sections — officeholders by branch/chamber, then coverage-only. */
export type RaceBucket =
  | "Executive"
  | "Senate"
  | "House"
  | "Governor"
  | "Supreme Court"
  | "Coverage";

export interface PoliticianSeed {
  name: string;
  slug: string;
  race?: string;
  bucket?: RaceBucket | string;
  aliases: string[];
}

const BUCKET_ORDER: RaceBucket[] = [
  "Executive",
  "Senate",
  "House",
  "Governor",
  "Supreme Court",
  "Coverage",
];

const OFFICE_BUCKETS = new Set<string>([
  "Executive",
  "Senate",
  "House",
  "Governor",
  "Supreme Court",
]);

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
  /**
   * Person-level scores (the politician themselves — ideology & claim record).
   * NOT an average of news coverage that mentions them.
   */
  personGrade: string | null;
  personFactuality: number | null;
  personLean: number | null;
  personLeanRationale: string | null;
  personGradeRationale: string | null;
  /** How media covering them graded (coverage of them — secondary). */
  coverageGrade: string | null;
  coverageFactuality: number | null;
  coverageLean: number | null;
  /**
   * @deprecated Alias of person* for race-board coverage math that still reads
   * avgFactuality as volume tie-break — race board uses coverage* via sideLive.
   * Politician pages must use person* fields.
   */
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
  if (/\s/.test(a) || a.includes("-") || a.includes(".")) {
    return haystack.includes(a.toLowerCase());
  }
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
  if (!b) return "Coverage";
  if (b === "Senate 2026") return "Senate";
  if (b === "U.S. leadership" || b === "Congress") return b === "Congress" ? "House" : "Executive";
  if (b === "International" || b === "Other") return "Coverage";
  if (OFFICE_BUCKETS.has(b)) return b as RaceBucket;
  return "Coverage";
}

/** Resolve officeholder seeds: live KV roster preferred over static snapshot. */
export async function resolvePoliticianSeeds(
  kv?: KVNamespace
): Promise<{ seeds: PoliticianSeed[]; updatedAt: string | null; source: string }> {
  if (kv) {
    try {
      const live = await getPoliticianRoster(kv);
      if (live?.seeds?.length) {
        return {
          seeds: live.seeds as PoliticianSeed[],
          updatedAt: live.updatedAt,
          source: live.source || "live roster",
        };
      }
    } catch {
      // fall through to static
    }
  }
  return {
    seeds: ROSTER_SEEDS as PoliticianSeed[],
    updatedAt: null,
    source: "static snapshot",
  };
}

/** @deprecated Prefer resolvePoliticianSeeds — kept for sync helpers. */
export const POLITICIAN_SEEDS: PoliticianSeed[] = ROSTER_SEEDS as PoliticianSeed[];

/** Build index from posts + officeholder seeds + person profiles. */
export function buildPoliticianIndex(
  posts: CollectionEntry<"posts">[],
  seeds: PoliticianSeed[] = POLITICIAN_SEEDS,
  profiles: PersonProfileMap | null = null
): PoliticianAgg[] {
  const seedBySlug = new Map(seeds.map((s) => [s.slug, s]));
  const bySlug = new Map<
    string,
    { name: string; slug: string; race?: string; bucket: RaceBucket; posts: Map<string, CollectionEntry<"posts">>; onRoster: boolean }
  >();

  const ensure = (
    slug: string,
    name: string,
    opts?: { race?: string; bucket?: string; onRoster?: boolean }
  ) => {
    let row = bySlug.get(slug);
    if (!row) {
      const seed = seedBySlug.get(slug);
      row = {
        name: name || seed?.name || slug,
        slug,
        race: opts?.race || seed?.race,
        bucket: normalizeBucket(opts?.bucket || seed?.bucket),
        posts: new Map(),
        onRoster: Boolean(opts?.onRoster || seed),
      };
      bySlug.set(slug, row);
    } else {
      if (opts?.race && !row.race) row.race = opts.race;
      if (opts?.onRoster) {
        row.onRoster = true;
        if (opts.bucket) row.bucket = normalizeBucket(opts.bucket);
      }
    }
    return row;
  };

  // Full officeholder roster always appears.
  for (const seed of seeds) {
    ensure(seed.slug, seed.name, { race: seed.race, bucket: seed.bucket, onRoster: true });
  }

  // Precompute each seed's alias matchers once — they're invariant across posts.
  // matchesAlias re-classifies each alias and recompiles its regex on every call,
  // so doing it inside the posts×seeds loop repeats that work ~2530× per seed.
  // The split below mirrors matchesAlias's exact rule (substring for aliases with
  // whitespace/"-"/".", word-boundary regex otherwise), so results are identical.
  const seedMatchers = seeds.map((seed) => {
    const needles: string[] = [];
    const regexes: RegExp[] = [];
    for (const raw of seed.aliases) {
      const a = raw.trim();
      if (!a) continue;
      if (/\s/.test(a) || a.includes("-") || a.includes(".")) needles.push(a.toLowerCase());
      else regexes.push(new RegExp(`\\b${escapeRe(a)}\\b`, "i"));
    }
    return { seed, needles, regexes };
  });

  for (const p of posts) {
    if (p.data.draft) continue;
    const blob = textBlob(p);

    for (const tag of p.data.politicians ?? []) {
      const slug = tag.slug.trim();
      if (!slug) continue;
      ensure(slug, tag.name.trim() || slug).posts.set(p.id, p);
    }

    for (const { seed, needles, regexes } of seedMatchers) {
      if (needles.some((n) => blob.includes(n)) || regexes.some((re) => re.test(blob))) {
        ensure(seed.slug, seed.name, {
          race: seed.race,
          bucket: seed.bucket,
          onRoster: true,
        }).posts.set(p.id, p);
      }
    }
  }

  const out: PoliticianAgg[] = [];
  for (const row of bySlug.values()) {
    // Coverage-only people need at least one report; officeholders always show.
    if (!row.onRoster && row.posts.size === 0) continue;

    // Non-roster people with reports → Coverage bucket
    if (!row.onRoster) row.bucket = "Coverage";

    const appearances = [...row.posts.values()]
      .map(appearanceFrom)
      .sort((a, b) => b.publishedAt.valueOf() - a.publishedAt.valueOf());

    // Coverage-of-them (media mentioning this person) — secondary metrics.
    const gpas = appearances.map((a) => gradeToGpa(a.letterGrade ?? undefined)).filter((n): n is number => n != null);
    const scores = appearances.map((a) => a.factualityScore).filter((n): n is number => n != null);
    const leans = appearances.map((a) => a.leanScore).filter((n): n is number => n != null);
    const coverageGrade = gpas.length ? gpaToGrade(gpas.reduce((a, b) => a + b, 0) / gpas.length) : null;
    const coverageFactuality = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
    const coverageLean = leans.length
      ? Math.round(leans.reduce((a, b) => a + b, 0) / leans.length)
      : null;

    // Person themselves (ideology + claim reliability) — never coverage average.
    const person = resolvePersonProfile(row.slug, profiles);

    out.push({
      name: row.name,
      slug: row.slug,
      race: row.race,
      bucket: row.bucket,
      appearances,
      personGrade: person?.letterGrade ?? null,
      personFactuality: person?.factualityScore ?? null,
      personLean: person != null ? person.leanScore : null,
      personLeanRationale: person?.leanRationale ?? null,
      personGradeRationale: person?.gradeRationale ?? null,
      coverageGrade,
      coverageFactuality,
      coverageLean,
      // Race board / legacy: coverage volume + factuality of coverage.
      avgGrade: coverageGrade,
      avgFactuality: coverageFactuality,
      avgLean: coverageLean,
    });
  }

  return out.sort(
    (a, b) => b.appearances.length - a.appearances.length || a.name.localeCompare(b.name)
  );
}

export async function findPolitician(
  posts: CollectionEntry<"posts">[],
  slug: string,
  kv?: KVNamespace
): Promise<PoliticianAgg | null> {
  const { seeds } = await resolvePoliticianSeeds(kv);
  const profiles = kv ? await getPersonProfileMap(kv) : null;
  return buildPoliticianIndex(posts, seeds, profiles).find((p) => p.slug === slug) ?? null;
}

/** Load seeds + person profiles for directory builds. */
export async function buildPoliticianIndexLive(
  posts: CollectionEntry<"posts">[],
  kv?: KVNamespace
): Promise<PoliticianAgg[]> {
  const { seeds } = await resolvePoliticianSeeds(kv);
  const profiles = kv ? await getPersonProfileMap(kv) : null;
  return buildPoliticianIndex(posts, seeds, profiles);
}

export interface PoliticianTag {
  name: string;
  slug: string;
}

/**
 * Deterministic tagger for drafts/publishes. Uses the static snapshot (sync)
 * so agent publish path doesn't need KV; live roster still drives the directory.
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

/** Group for the index page — officeholders by branch, then Coverage. */
export function groupPoliticiansByBucket(
  list: PoliticianAgg[]
): { bucket: RaceBucket; items: PoliticianAgg[] }[] {
  const map = new Map<RaceBucket, PoliticianAgg[]>();
  for (const p of list) {
    const b = normalizeBucket(p.bucket);
    if (!map.has(b)) map.set(b, []);
    map.get(b)!.push(p);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((bucket) => ({
    bucket,
    items: (map.get(bucket) ?? []).sort(
      (a, b) => a.name.localeCompare(b.name) || b.appearances.length - a.appearances.length
    ),
  }));
}

/** Human labels for section headers. */
export function bucketLabel(bucket: RaceBucket): string {
  switch (bucket) {
    case "Executive":
      return "Executive branch";
    case "Senate":
      return "U.S. Senate";
    case "House":
      return "U.S. House";
    case "Governor":
      return "Governors";
    case "Supreme Court":
      return "Supreme Court";
    case "Coverage":
      return "Also in coverage";
    default:
      return bucket;
  }
}
