/**
 * Midterm-oriented politician index for /politicians/*.
 *
 * Two sources of membership, merged:
 *  1. Optional post frontmatter `politicians: [{ name, slug, ... }]` (agent/editor).
 *  2. Curated seed list matched against headline + topics + summary (word-boundary
 *     aliases). Seed matching is conservative — no single-token common names.
 *
 * Aggregate grades/leans follow the hybrid access model: compute here, render
 * gated in the page (same pattern as /outlets/[outlet]/).
 */
import type { CollectionEntry } from "astro:content";
import { gradeToGpa, gpaToGrade, leanScoreOf } from "./topics.ts";

export interface PoliticianSeed {
  name: string;
  slug: string;
  /** Race / office label for the index (not used in matching). */
  race?: string;
  /** Case-insensitive whole-word aliases (multi-token preferred). */
  aliases: string[];
}

/** Fall 2026 toss-up focus + high-signal national figures. Expand as races firm up. */
export const POLITICIAN_SEEDS: PoliticianSeed[] = [
  { name: "Jon Ossoff", slug: "jon-ossoff", race: "GA Senate", aliases: ["Jon Ossoff", "Ossoff"] },
  { name: "Roy Cooper", slug: "roy-cooper", race: "NC Senate", aliases: ["Roy Cooper"] },
  { name: "Thom Tillis", slug: "thom-tillis", race: "NC Senate", aliases: ["Thom Tillis", "Tillis"] },
  { name: "Sherrod Brown", slug: "sherrod-brown", race: "OH Senate", aliases: ["Sherrod Brown"] },
  { name: "Jon Husted", slug: "jon-husted", race: "OH Senate", aliases: ["Jon Husted", "Husted"] },
  { name: "Susan Collins", slug: "susan-collins", race: "ME Senate", aliases: ["Susan Collins"] },
  { name: "Gavin Newsom", slug: "gavin-newsom", race: "CA Governor", aliases: ["Gavin Newsom", "Newsom"] },
  { name: "JD Vance", slug: "jd-vance", race: "Vice President", aliases: ["JD Vance", "J.D. Vance", "Vance"] },
  { name: "Donald Trump", slug: "donald-trump", race: "President", aliases: ["Donald Trump", "President Trump"] },
  { name: "Kamala Harris", slug: "kamala-harris", race: "Former VP", aliases: ["Kamala Harris"] },
  { name: "Graham Platner", slug: "graham-platner", race: "ME Senate", aliases: ["Graham Platner", "Platner"] },
  { name: "Zohran Mamdani", slug: "zohran-mamdani", race: "NYC Mayor race", aliases: ["Zohran Mamdani", "Mamdani"] },
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
  appearances: PoliticianAppearance[];
  avgGrade: string | null;
  avgFactuality: number | null;
  avgLean: number | null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesAlias(haystack: string, alias: string): boolean {
  // Multi-word aliases: loose contains (case-insensitive).
  // Single-token: word boundary to cut false positives.
  const a = alias.trim();
  if (!a) return false;
  if (/\s/.test(a)) return haystack.includes(a.toLowerCase());
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

/** Build the full politician index from a posts collection. */
export function buildPoliticianIndex(posts: CollectionEntry<"posts">[]): PoliticianAgg[] {
  const bySlug = new Map<string, { name: string; slug: string; race?: string; posts: Map<string, CollectionEntry<"posts">> }>();

  const ensure = (slug: string, name: string, race?: string) => {
    let row = bySlug.get(slug);
    if (!row) {
      row = { name, slug, race, posts: new Map() };
      bySlug.set(slug, row);
    } else if (race && !row.race) {
      row.race = race;
    }
    return row;
  };

  // Seed table for alias matching.
  for (const seed of POLITICIAN_SEEDS) {
    ensure(seed.slug, seed.name, seed.race);
  }

  for (const p of posts) {
    if (p.data.draft) continue;
    const blob = textBlob(p);

    // 1) Explicit frontmatter tags (when agents/editors start adding them).
    for (const tag of p.data.politicians ?? []) {
      const slug = tag.slug.trim();
      if (!slug) continue;
      ensure(slug, tag.name.trim() || slug).posts.set(p.id, p);
    }

    // 2) Seed alias match.
    for (const seed of POLITICIAN_SEEDS) {
      if (seed.aliases.some((a) => matchesAlias(blob, a))) {
        ensure(seed.slug, seed.name, seed.race).posts.set(p.id, p);
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
