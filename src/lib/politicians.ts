/**
 * Midterm-oriented politician index for /politicians/*.
 *
 * Two sources of membership, merged:
 *  1. Optional post frontmatter `politicians: [{ name, slug, ... }]` (agent/editor).
 *  2. Curated seed list matched against headline + topics + summary (word-boundary
 *     aliases). Seed matching is conservative — no bare common surnames alone.
 *
 * Aggregate grades/leans follow the hybrid access model: compute here, render
 * gated in the page (same pattern as /outlets/[outlet]/). OG share cards use
 * only public fields (name, race, report count) — no averages.
 */
import type { CollectionEntry } from "astro:content";
import { gradeToGpa, gpaToGrade, leanScoreOf } from "./topics.ts";

/** Index / filter grouping for the politicians directory. */
export type RaceBucket =
  | "Senate 2026"
  | "Governor"
  | "U.S. leadership"
  | "Congress"
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

/**
 * Fall 2026 focus + high-signal figures that already appear in graded coverage.
 * Expand when matchups firm up. Avoid bare common surnames (Brown, Smith, Scott).
 */
export const POLITICIAN_SEEDS: PoliticianSeed[] = [
  // ── Senate 2026 toss-ups ─────────────────────────────────────────────
  { name: "Jon Ossoff", slug: "jon-ossoff", race: "GA Senate", bucket: "Senate 2026", aliases: ["Jon Ossoff", "Ossoff"] },
  { name: "Raphael Warnock", slug: "raphael-warnock", race: "GA Senate", bucket: "Senate 2026", aliases: ["Raphael Warnock", "Warnock"] },
  { name: "Roy Cooper", slug: "roy-cooper", race: "NC Senate", bucket: "Senate 2026", aliases: ["Roy Cooper"] },
  { name: "Thom Tillis", slug: "thom-tillis", race: "NC Senate", bucket: "Senate 2026", aliases: ["Thom Tillis", "Tillis"] },
  { name: "Sherrod Brown", slug: "sherrod-brown", race: "OH Senate", bucket: "Senate 2026", aliases: ["Sherrod Brown"] },
  { name: "Jon Husted", slug: "jon-husted", race: "OH Senate", bucket: "Senate 2026", aliases: ["Jon Husted", "Husted"] },
  { name: "Bernie Moreno", slug: "bernie-moreno", race: "OH Senate", bucket: "Senate 2026", aliases: ["Bernie Moreno"] },
  { name: "Susan Collins", slug: "susan-collins", race: "ME Senate", bucket: "Senate 2026", aliases: ["Susan Collins"] },
  { name: "Graham Platner", slug: "graham-platner", race: "ME Senate", bucket: "Senate 2026", aliases: ["Graham Platner", "Platner"] },
  { name: "Ted Cruz", slug: "ted-cruz", race: "TX Senate", bucket: "Senate 2026", aliases: ["Ted Cruz"] },
  { name: "Colin Allred", slug: "colin-allred", race: "TX Senate", bucket: "Senate 2026", aliases: ["Colin Allred", "Allred"] },
  { name: "John Cornyn", slug: "john-cornyn", race: "TX Senate", bucket: "Senate 2026", aliases: ["John Cornyn", "Cornyn"] },
  { name: "Elissa Slotkin", slug: "elissa-slotkin", race: "MI Senate", bucket: "Senate 2026", aliases: ["Elissa Slotkin", "Slotkin"] },
  { name: "Mike Rogers", slug: "mike-rogers", race: "MI Senate", bucket: "Senate 2026", aliases: ["Mike Rogers"] },
  { name: "Tammy Baldwin", slug: "tammy-baldwin", race: "WI Senate", bucket: "Senate 2026", aliases: ["Tammy Baldwin"] },
  { name: "Eric Hovde", slug: "eric-hovde", race: "WI Senate", bucket: "Senate 2026", aliases: ["Eric Hovde", "Hovde"] },
  { name: "Bob Casey", slug: "bob-casey", race: "PA Senate", bucket: "Senate 2026", aliases: ["Bob Casey", "Robert Casey"] },
  { name: "Dave McCormick", slug: "dave-mccormick", race: "PA Senate", bucket: "Senate 2026", aliases: ["Dave McCormick", "David McCormick", "McCormick"] },
  { name: "Ruben Gallego", slug: "ruben-gallego", race: "AZ Senate", bucket: "Senate 2026", aliases: ["Ruben Gallego", "Gallego"] },
  { name: "Kari Lake", slug: "kari-lake", race: "AZ Senate", bucket: "Senate 2026", aliases: ["Kari Lake"] },
  { name: "Mark Kelly", slug: "mark-kelly", race: "AZ Senate", bucket: "Senate 2026", aliases: ["Mark Kelly", "Sen. Kelly", "Senator Kelly"] },
  { name: "John Fetterman", slug: "john-fetterman", race: "PA Senate", bucket: "Senate 2026", aliases: ["John Fetterman", "Fetterman"] },
  { name: "Jim Banks", slug: "jim-banks", race: "IN Senate", bucket: "Senate 2026", aliases: ["Jim Banks"] },
  { name: "Tim Sheehy", slug: "tim-sheehy", race: "MT Senate", bucket: "Senate 2026", aliases: ["Tim Sheehy", "Sheehy"] },
  { name: "Jon Tester", slug: "jon-tester", race: "MT Senate", bucket: "Senate 2026", aliases: ["Jon Tester", "Tester"] },
  { name: "Jacky Rosen", slug: "jacky-rosen", race: "NV Senate", bucket: "Senate 2026", aliases: ["Jacky Rosen"] },
  { name: "Sam Brown", slug: "sam-brown", race: "NV Senate", bucket: "Senate 2026", aliases: ["Sam Brown"] },
  { name: "Peter Welch", slug: "peter-welch", race: "VT Senate", bucket: "Senate 2026", aliases: ["Peter Welch"] },
  { name: "John Curtis", slug: "john-curtis", race: "UT Senate", bucket: "Senate 2026", aliases: ["John Curtis"] },
  { name: "Angela Alsobrooks", slug: "angela-alsobrooks", race: "MD Senate", bucket: "Senate 2026", aliases: ["Angela Alsobrooks", "Alsobrooks"] },
  { name: "Larry Hogan", slug: "larry-hogan", race: "MD Senate", bucket: "Senate 2026", aliases: ["Larry Hogan"] },
  { name: "Deb Fischer", slug: "deb-fischer", race: "NE Senate", bucket: "Senate 2026", aliases: ["Deb Fischer"] },
  { name: "Pete Ricketts", slug: "pete-ricketts", race: "NE Senate", bucket: "Senate 2026", aliases: ["Pete Ricketts", "Ricketts"] },

  // ── Governors ────────────────────────────────────────────────────────
  { name: "Gavin Newsom", slug: "gavin-newsom", race: "CA Governor", bucket: "Governor", aliases: ["Gavin Newsom", "Newsom"] },
  { name: "Greg Abbott", slug: "greg-abbott", race: "TX Governor", bucket: "Governor", aliases: ["Greg Abbott", "Governor Abbott"] },
  { name: "Brian Kemp", slug: "brian-kemp", race: "GA Governor", bucket: "Governor", aliases: ["Brian Kemp", "Governor Kemp"] },
  { name: "Gretchen Whitmer", slug: "gretchen-whitmer", race: "MI Governor", bucket: "Governor", aliases: ["Gretchen Whitmer", "Whitmer"] },
  { name: "Josh Shapiro", slug: "josh-shapiro", race: "PA Governor", bucket: "Governor", aliases: ["Josh Shapiro", "Shapiro"] },
  { name: "Tony Evers", slug: "tony-evers", race: "WI Governor", bucket: "Governor", aliases: ["Tony Evers"] },
  { name: "Katie Hobbs", slug: "katie-hobbs", race: "AZ Governor", bucket: "Governor", aliases: ["Katie Hobbs"] },
  { name: "Ron DeSantis", slug: "ron-desantis", race: "FL Governor", bucket: "Governor", aliases: ["Ron DeSantis", "DeSantis"] },
  { name: "Glenn Youngkin", slug: "glenn-youngkin", race: "VA Governor", bucket: "Governor", aliases: ["Glenn Youngkin", "Youngkin"] },
  { name: "Andy Beshear", slug: "andy-beshear", race: "KY Governor", bucket: "Governor", aliases: ["Andy Beshear", "Beshear"] },
  { name: "JB Pritzker", slug: "jb-pritzker", race: "IL Governor", bucket: "Governor", aliases: ["JB Pritzker", "J.B. Pritzker", "Pritzker"] },
  { name: "Kathy Hochul", slug: "kathy-hochul", race: "NY Governor", bucket: "Governor", aliases: ["Kathy Hochul", "Hochul"] },
  { name: "Wes Moore", slug: "wes-moore", race: "MD Governor", bucket: "Governor", aliases: ["Wes Moore"] },
  { name: "Sarah Huckabee Sanders", slug: "sarah-huckabee-sanders", race: "AR Governor", bucket: "Governor", aliases: ["Sarah Huckabee Sanders", "Huckabee Sanders"] },

  // ── U.S. leadership ──────────────────────────────────────────────────
  { name: "Donald Trump", slug: "donald-trump", race: "President", bucket: "U.S. leadership", aliases: ["Donald Trump", "President Trump"] },
  { name: "JD Vance", slug: "jd-vance", race: "Vice President", bucket: "U.S. leadership", aliases: ["JD Vance", "J.D. Vance", "Vice President Vance"] },
  { name: "Kamala Harris", slug: "kamala-harris", race: "Former VP", bucket: "U.S. leadership", aliases: ["Kamala Harris"] },
  { name: "Joe Biden", slug: "joe-biden", race: "Former President", bucket: "U.S. leadership", aliases: ["Joe Biden", "President Biden"] },
  { name: "Barack Obama", slug: "barack-obama", race: "Former President", bucket: "U.S. leadership", aliases: ["Barack Obama", "President Obama", "Obama"] },
  { name: "Mike Johnson", slug: "mike-johnson", race: "House Speaker", bucket: "U.S. leadership", aliases: ["Speaker Johnson", "Mike Johnson"] },
  { name: "Hakeem Jeffries", slug: "hakeem-jeffries", race: "House Minority Leader", bucket: "U.S. leadership", aliases: ["Hakeem Jeffries", "Jeffries"] },
  { name: "Chuck Schumer", slug: "chuck-schumer", race: "Senate Majority Leader", bucket: "U.S. leadership", aliases: ["Chuck Schumer", "Schumer"] },
  { name: "Mitch McConnell", slug: "mitch-mcconnell", race: "Senate", bucket: "U.S. leadership", aliases: ["Mitch McConnell", "McConnell"] },

  // ── Congress / high signal ───────────────────────────────────────────
  { name: "Alexandria Ocasio-Cortez", slug: "aoc", race: "U.S. House", bucket: "Congress", aliases: ["Alexandria Ocasio-Cortez", "Ocasio-Cortez", "AOC"] },
  { name: "Bernie Sanders", slug: "bernie-sanders", race: "U.S. Senate", bucket: "Congress", aliases: ["Bernie Sanders"] },
  { name: "Elizabeth Warren", slug: "elizabeth-warren", race: "U.S. Senate", bucket: "Congress", aliases: ["Elizabeth Warren"] },
  { name: "Marco Rubio", slug: "marco-rubio", race: "U.S. Senate / Cabinet", bucket: "Congress", aliases: ["Marco Rubio"] },
  { name: "Lindsey Graham", slug: "lindsey-graham", race: "U.S. Senate", bucket: "Congress", aliases: ["Lindsey Graham"] },
  { name: "Tim Scott", slug: "tim-scott", race: "U.S. Senate", bucket: "Congress", aliases: ["Tim Scott"] },
  { name: "Chris Murphy", slug: "chris-murphy", race: "U.S. Senate", bucket: "Congress", aliases: ["Chris Murphy"] },
  { name: "Cory Booker", slug: "cory-booker", race: "U.S. Senate", bucket: "Congress", aliases: ["Cory Booker"] },
  { name: "Amy Klobuchar", slug: "amy-klobuchar", race: "U.S. Senate", bucket: "Congress", aliases: ["Amy Klobuchar", "Klobuchar"] },
  { name: "Zohran Mamdani", slug: "zohran-mamdani", race: "NYC Mayor race", bucket: "Other", aliases: ["Zohran Mamdani", "Mamdani"] },
  { name: "Robert F. Kennedy Jr.", slug: "rfk-jr", race: "HHS / national", bucket: "U.S. leadership", aliases: ["Robert F. Kennedy", "RFK Jr", "RFK Junior", "Kennedy Jr"] },
  { name: "Nikki Haley", slug: "nikki-haley", race: "National", bucket: "Other", aliases: ["Nikki Haley"] },
  { name: "Vivek Ramaswamy", slug: "vivek-ramaswamy", race: "National", bucket: "Other", aliases: ["Vivek Ramaswamy", "Ramaswamy"] },
  { name: "Ken Paxton", slug: "ken-paxton", race: "TX Attorney General", bucket: "Other", aliases: ["Ken Paxton"] },

  // ── International (often in graded broadcasts) ───────────────────────
  { name: "Keir Starmer", slug: "keir-starmer", race: "UK PM", bucket: "International", aliases: ["Keir Starmer", "Starmer"] },
  { name: "Nigel Farage", slug: "nigel-farage", race: "UK", bucket: "International", aliases: ["Nigel Farage", "Farage"] },
  { name: "Benjamin Netanyahu", slug: "benjamin-netanyahu", race: "Israel PM", bucket: "International", aliases: ["Benjamin Netanyahu", "Netanyahu", "Bibi"] },
  { name: "Volodymyr Zelenskyy", slug: "volodymyr-zelenskyy", race: "Ukraine President", bucket: "International", aliases: ["Volodymyr Zelenskyy", "Zelenskyy", "Zelensky"] },
  { name: "Vladimir Putin", slug: "vladimir-putin", race: "Russia President", bucket: "International", aliases: ["Vladimir Putin", "Putin"] },
  { name: "Xi Jinping", slug: "xi-jinping", race: "China President", bucket: "International", aliases: ["Xi Jinping"] },
  { name: "Mark Carney", slug: "mark-carney", race: "Canada", bucket: "International", aliases: ["Mark Carney"] },
  { name: "Justin Trudeau", slug: "justin-trudeau", race: "Canada", bucket: "International", aliases: ["Justin Trudeau", "Trudeau"] },
];

const BUCKET_ORDER: RaceBucket[] = [
  "Senate 2026",
  "Governor",
  "U.S. leadership",
  "Congress",
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
  // Multi-word: substring match (case-insensitive haystack).
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
        bucket: bucket || seed?.bucket || "Other",
        posts: new Map(),
      };
      bySlug.set(slug, row);
    } else {
      if (race && !row.race) row.race = race;
      if (bucket && row.bucket === "Other") row.bucket = bucket;
    }
    return row;
  };

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
    if (row.posts.size === 0) continue;
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

  return out.sort((a, b) => b.appearances.length - a.appearances.length || a.name.localeCompare(b.name));
}

export function findPolitician(posts: CollectionEntry<"posts">[], slug: string): PoliticianAgg | null {
  return buildPoliticianIndex(posts).find((p) => p.slug === slug) ?? null;
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
    const b = p.bucket || "Other";
    if (!map.has(b)) map.set(b, []);
    map.get(b)!.push(p);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((bucket) => ({
    bucket,
    items: map.get(bucket)!,
  }));
}
