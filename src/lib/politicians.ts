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
    // Falls back to named seeds, then party/office lean so every officeholder has a baseline.
    const person = resolvePersonProfile(row.slug, profiles, {
      race: row.race,
      bucket: row.bucket,
      name: row.name,
    });

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

/**
 * Within-branch hierarchy rank (lower first). Examples:
 * Executive: President → VP → Cabinet → other
 * SCOTUS: Chief → associates
 * Then alphabetical by name among equals.
 */
export function officeHierarchyRank(p: {
  name?: string;
  race?: string;
  bucket?: string;
}): number {
  const race = (p.race || "").toLowerCase();
  const name = (p.name || "").toLowerCase();
  const bucket = normalizeBucket(p.bucket);

  if (bucket === "Executive") {
    if (/^president of the united states$/.test(race) || (race.includes("president") && !race.includes("vice")))
      return 0;
    if (race.includes("vice president")) return 1;
    if (race.includes("chief of staff")) return 2;
    if (race.startsWith("secretary of") || race.includes("attorney general")) return 10;
    if (race.includes("ambassador") || race.includes("director") || race.includes("administrator")) return 20;
    // Known principals by name if race string is thin
    if (name.includes("trump") && !name.includes("barron")) return 0;
    if (name.includes("vance")) return 1;
    return 30;
  }

  if (bucket === "Supreme Court") {
    if (race.includes("chief justice")) return 0;
    if (name.includes("roberts") && race.includes("supreme")) return 0;
    return 10;
  }

  if (bucket === "Senate") {
    if (race.includes("majority leader") || race.includes("minority leader")) return 0;
    if (race.includes("class ii") || race.includes("class 2") || race.includes("(2026)")) return 5;
    return 10;
  }

  if (bucket === "House") {
    if (race.includes("speaker")) return 0;
    if (race.includes("majority leader") || race.includes("minority leader")) return 1;
    return 10;
  }

  if (bucket === "Governor") return 10;

  // Coverage: sort by attention later
  return 50;
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
    items: (map.get(bucket) ?? []).sort((a, b) => {
      if (bucket === "Coverage") {
        return b.appearances.length - a.appearances.length || a.name.localeCompare(b.name);
      }
      const ra = officeHierarchyRank(a);
      const rb = officeHierarchyRank(b);
      return ra - rb || a.name.localeCompare(b.name) || b.appearances.length - a.appearances.length;
    }),
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

/** URL slug for drill-in: /politicians/?branch=senate */
export function bucketSlug(bucket: RaceBucket): string {
  switch (bucket) {
    case "Executive":
      return "executive";
    case "Senate":
      return "senate";
    case "House":
      return "house";
    case "Governor":
      return "governor";
    case "Supreme Court":
      return "supreme-court";
    case "Coverage":
      return "coverage";
    default:
      return "coverage";
  }
}

/** Parse ?branch= query into a RaceBucket (null if missing/unknown). */
export function bucketFromSlug(raw: string | null | undefined): RaceBucket | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/_/g, "-");
  switch (s) {
    case "executive":
    case "exec":
      return "Executive";
    case "senate":
      return "Senate";
    case "house":
      return "House";
    case "governor":
    case "governors":
    case "gov":
      return "Governor";
    case "supreme-court":
    case "supremecourt":
    case "scotus":
    case "court":
      return "Supreme Court";
    case "coverage":
    case "other":
      return "Coverage";
    default:
      return null;
  }
}

/** One-line blurb on the branch hub cards. */
export function bucketBlurb(bucket: RaceBucket): string {
  switch (bucket) {
    case "Executive":
      return "President, VP, and cabinet-level figures on our roster.";
    case "Senate":
      return "Sitting senators and 2026 Class II contenders we track.";
    case "House":
      return "Representatives and leadership names in graded coverage.";
    case "Governor":
      return "State executives — midterm cycle and beyond.";
    case "Supreme Court":
      return "Justices of the U.S. Supreme Court.";
    case "Coverage":
      return "People who appear in reports but aren’t on the officeholder roster.";
    default:
      return "";
  }
}

export { BUCKET_ORDER };
