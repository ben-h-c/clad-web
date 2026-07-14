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
  // ── Senate 2026 (Class II) ───────────────────────────────────────────
  // Official Class II map: terms expire Jan 2027 (last regular election 2020 / specials).
  { name: "Jon Ossoff", slug: "jon-ossoff", race: "GA Senate (Class II · 2026)", bucket: "Senate 2026", aliases: ["Jon Ossoff", "Ossoff"] },
  { name: "Mike Collins", slug: "mike-collins", race: "GA Senate challenger", bucket: "Senate 2026", aliases: ["Mike Collins", "Rep. Collins"] },
  { name: "Thom Tillis", slug: "thom-tillis", race: "NC Senate (Class II · 2026)", bucket: "Senate 2026", aliases: ["Thom Tillis", "Tillis"] },
  { name: "Roy Cooper", slug: "roy-cooper", race: "NC Senate contender", bucket: "Senate 2026", aliases: ["Roy Cooper"] },
  { name: "Susan Collins", slug: "susan-collins", race: "ME Senate (Class II · 2026)", bucket: "Senate 2026", aliases: ["Susan Collins"] },
  { name: "Graham Platner", slug: "graham-platner", race: "ME Senate contender", bucket: "Senate 2026", aliases: ["Graham Platner", "Platner"] },
  { name: "John Cornyn", slug: "john-cornyn", race: "TX Senate (Class II · 2026)", bucket: "Senate 2026", aliases: ["John Cornyn", "Cornyn"] },
  { name: "Colin Allred", slug: "colin-allred", race: "TX Senate contender", bucket: "Senate 2026", aliases: ["Colin Allred", "Allred"] },
  { name: "Tina Smith", slug: "tina-smith", race: "MN Senate open (Class II · retiring)", bucket: "Senate 2026", aliases: ["Tina Smith", "Sen. Smith"] },
  { name: "Jeanne Shaheen", slug: "jeanne-shaheen", race: "NH Senate open (Class II · retiring)", bucket: "Senate 2026", aliases: ["Jeanne Shaheen", "Shaheen"] },
  { name: "Steve Daines", slug: "steve-daines", race: "MT Senate (Class II · 2026)", bucket: "Senate 2026", aliases: ["Steve Daines", "Daines"] },
  { name: "John Hickenlooper", slug: "john-hickenlooper", race: "CO Senate (Class II · 2026)", bucket: "Senate 2026", aliases: ["John Hickenlooper", "Hickenlooper"] },
  { name: "Dick Durbin", slug: "dick-durbin", race: "IL Senate open (Class II · retiring)", bucket: "Senate 2026", aliases: ["Dick Durbin", "Durbin"] },
  { name: "Gary Peters", slug: "gary-peters", race: "MI Senate open (Class II · retiring)", bucket: "Senate 2026", aliases: ["Gary Peters", "Sen. Peters"] },
  { name: "Haley Stevens", slug: "haley-stevens", race: "MI Senate contender", bucket: "Senate 2026", aliases: ["Haley Stevens", "Rep. Stevens"] },
  { name: "Abdul El-Sayed", slug: "abdul-el-sayed", race: "MI Senate contender", bucket: "Senate 2026", aliases: ["Abdul El-Sayed", "El-Sayed", "Elsayed"] },
  { name: "Mike Rogers", slug: "mike-rogers", race: "MI Senate contender", bucket: "Senate 2026", aliases: ["Mike Rogers"] },
  { name: "Pete Ricketts", slug: "pete-ricketts", race: "NE Senate (Class II · 2026)", bucket: "Senate 2026", aliases: ["Pete Ricketts", "Ricketts"] },
  { name: "Cory Booker", slug: "cory-booker", race: "NJ Senate (Class II · 2026)", bucket: "Senate 2026", aliases: ["Cory Booker"] },
  { name: "Lindsey Graham", slug: "lindsey-graham", race: "SC Senate vacancy (Class II · d. 2026)", bucket: "Senate 2026", aliases: ["Lindsey Graham"] },
  { name: "Annie Andrews", slug: "annie-andrews", race: "SC Senate contender", bucket: "Senate 2026", aliases: ["Annie Andrews", "Dr. Annie Andrews"] },

  // Class I / III — not on 2026 Senate ballot (still covered in news)
  { name: "Raphael Warnock", slug: "raphael-warnock", race: "GA Senate (Class III · 2028)", bucket: "Congress", aliases: ["Raphael Warnock", "Warnock"] },
  { name: "Elissa Slotkin", slug: "elissa-slotkin", race: "MI Senate (Class I · 2030)", bucket: "Congress", aliases: ["Elissa Slotkin", "Slotkin"] },
  { name: "Michael Bennet", slug: "michael-bennet", race: "CO Senate (Class III · 2028)", bucket: "Congress", aliases: ["Michael Bennet", "Sen. Bennet"] },
  { name: "Ted Cruz", slug: "ted-cruz", race: "TX Senate (Class I · 2030)", bucket: "Congress", aliases: ["Ted Cruz"] },
  { name: "Tammy Baldwin", slug: "tammy-baldwin", race: "WI Senate (Class I · 2030)", bucket: "Congress", aliases: ["Tammy Baldwin"] },
  { name: "John Fetterman", slug: "john-fetterman", race: "PA Senate (Class III · 2028)", bucket: "Congress", aliases: ["John Fetterman", "Fetterman"] },
  { name: "Bob Casey", slug: "bob-casey", race: "PA politics", bucket: "Other", aliases: ["Bob Casey", "Robert Casey"] },
  { name: "Dave McCormick", slug: "dave-mccormick", race: "PA politics", bucket: "Other", aliases: ["Dave McCormick", "David McCormick", "McCormick"] },
  { name: "Ruben Gallego", slug: "ruben-gallego", race: "AZ Senate (Class I · 2030)", bucket: "Congress", aliases: ["Ruben Gallego", "Gallego"] },
  { name: "Mark Kelly", slug: "mark-kelly", race: "AZ Senate (Class III · 2028)", bucket: "Congress", aliases: ["Mark Kelly", "Sen. Kelly", "Senator Kelly"] },
  { name: "Jacky Rosen", slug: "jacky-rosen", race: "NV Senate (Class I · 2030)", bucket: "Congress", aliases: ["Jacky Rosen"] },
  { name: "Sherrod Brown", slug: "sherrod-brown", race: "OH politics", bucket: "Other", aliases: ["Sherrod Brown"] },
  { name: "Jon Husted", slug: "jon-husted", race: "OH politics", bucket: "Other", aliases: ["Jon Husted", "Husted"] },
  { name: "Bernie Moreno", slug: "bernie-moreno", race: "OH politics", bucket: "Other", aliases: ["Bernie Moreno"] },
  { name: "Eric Hovde", slug: "eric-hovde", race: "WI politics", bucket: "Other", aliases: ["Eric Hovde", "Hovde"] },
  { name: "Jon Tester", slug: "jon-tester", race: "MT politics", bucket: "Other", aliases: ["Jon Tester", "Tester"] },
  { name: "Tim Sheehy", slug: "tim-sheehy", race: "MT politics", bucket: "Other", aliases: ["Tim Sheehy", "Sheehy"] },
  { name: "Kari Lake", slug: "kari-lake", race: "AZ Governor contender", bucket: "Governor", aliases: ["Kari Lake"] },
  { name: "Angela Alsobrooks", slug: "angela-alsobrooks", race: "MD Senate (Class I · 2030)", bucket: "Congress", aliases: ["Angela Alsobrooks", "Alsobrooks"] },
  { name: "Larry Hogan", slug: "larry-hogan", race: "MD politics", bucket: "Other", aliases: ["Larry Hogan"] },
  { name: "Deb Fischer", slug: "deb-fischer", race: "NE Senate (Class I · 2030)", bucket: "Congress", aliases: ["Deb Fischer"] },
  { name: "Joe Lombardo", slug: "joe-lombardo", race: "NV Governor", bucket: "Governor", aliases: ["Joe Lombardo", "Governor Lombardo"] },
  { name: "Sam Brown", slug: "sam-brown", race: "NV politics", bucket: "Other", aliases: ["Sam Brown"] },
  { name: "Jim Banks", slug: "jim-banks", race: "IN politics", bucket: "Other", aliases: ["Jim Banks"] },
  { name: "Phil Weiser", slug: "phil-weiser", race: "CO Governor contender", bucket: "Governor", aliases: ["Phil Weiser", "Weiser"] },

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
  { name: "Tim Scott", slug: "tim-scott", race: "U.S. Senate", bucket: "Congress", aliases: ["Tim Scott"] },
  { name: "Chris Murphy", slug: "chris-murphy", race: "U.S. Senate", bucket: "Congress", aliases: ["Chris Murphy"] },
  { name: "Amy Klobuchar", slug: "amy-klobuchar", race: "MN Senate (Class I · 2030)", bucket: "Congress", aliases: ["Amy Klobuchar", "Klobuchar"] },
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
