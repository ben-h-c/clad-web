/**
 * Midterms 2026 "March Madness" coverage bracket.
 *
 * Seeds the 16 politicians with the most graded appearances, pairs classic
 * 1v16 / 8v9 / …, and advances the higher avg-factuality (then report count)
 * into later rounds. Guests see the field + counts; signed-in readers see
 * who "leads" each matchup by coverage grade.
 */
import type { CollectionEntry } from "astro:content";
import { buildPoliticianIndex, type PoliticianAgg } from "./politicians.ts";
import { gradeToGpa } from "./topics.ts";

export type BracketRoundId = "r16" | "qf" | "sf" | "final";

export interface BracketSlot {
  seed: number;
  politician: PoliticianAgg | null;
}

export interface BracketMatchup {
  id: string;
  round: BracketRoundId;
  region: string;
  a: BracketSlot;
  b: BracketSlot;
  /** Winner slug when scores are visible; null if locked or incomplete. */
  leaderSlug: string | null;
  /** Why they lead (for tooltips). */
  leaderReason: string | null;
}

export interface BracketBoard {
  title: string;
  subtitle: string;
  generatedAt: string;
  /** Top 16 by coverage volume. */
  field: PoliticianAgg[];
  matchups: BracketMatchup[];
  champion: PoliticianAgg | null;
}

const ROUND_ORDER: BracketRoundId[] = ["r16", "qf", "sf", "final"];

function coverageScore(p: PoliticianAgg): number {
  // Primary: volume (more graded coverage = higher seed strength).
  // Tie-break: factuality avg, then letter GPA.
  const fact = p.avgFactuality ?? 50;
  const gpa = p.avgGrade ? gradeToGpa(p.avgGrade) ?? 0 : 0;
  return p.appearances.length * 1000 + fact * 10 + gpa;
}

function leaderOf(
  a: PoliticianAgg | null,
  b: PoliticianAgg | null,
  revealScores: boolean
): { slug: string | null; reason: string | null } {
  if (!a || !b) return { slug: null, reason: null };
  if (!revealScores) return { slug: null, reason: null };
  const sa = coverageScore(a);
  const sb = coverageScore(b);
  if (sa === sb) {
    // Pure volume tie-break for display.
    if (a.appearances.length !== b.appearances.length) {
      const w = a.appearances.length >= b.appearances.length ? a : b;
      return { slug: w.slug, reason: "More graded reports" };
    }
    return { slug: a.slug, reason: "Tied — higher seed" };
  }
  const w = sa > sb ? a : b;
  const fact = w.avgFactuality != null ? `avg factuality ${w.avgFactuality}` : "coverage volume";
  return {
    slug: w.slug,
    reason: `${w.appearances.length} reports · ${fact}`,
  };
}

/** Classic seed pairings for 4 / 8 / 16 fields (0-based indices). */
function pairClassic(field: PoliticianAgg[]): [PoliticianAgg, PoliticianAgg][] {
  const n = field.length;
  const order16 = [
    [0, 15],
    [7, 8],
    [3, 12],
    [4, 11],
    [1, 14],
    [6, 9],
    [2, 13],
    [5, 10],
  ];
  const order8 = [
    [0, 7],
    [3, 4],
    [1, 6],
    [2, 5],
  ];
  const order4 = [
    [0, 3],
    [1, 2],
  ];
  const order = n >= 16 ? order16 : n >= 8 ? order8 : order4;
  return order.map(([i, j]) => [field[i]!, field[j]!]);
}

const REGIONS = ["South", "Midwest", "Northeast", "West"] as const;

/**
 * Build a single-elim board from live politician coverage.
 * Uses the largest power-of-two field size ≤ available people (16 / 8 / 4).
 */
export function buildCoverageBracket(
  posts: CollectionEntry<"posts">[],
  revealScores: boolean
): BracketBoard {
  const all = buildPoliticianIndex(posts);
  const ranked = [...all].sort((a, b) => coverageScore(b) - coverageScore(a));
  const size = ranked.length >= 16 ? 16 : ranked.length >= 8 ? 8 : ranked.length >= 4 ? 4 : 0;
  const field = ranked.slice(0, size);

  const matchups: BracketMatchup[] = [];
  const empty = {
    title: "Midterms 2026 Coverage Bracket",
    subtitle:
      "March Madness for the campaign trail: top figures by graded coverage on CladFacts. Matchups advance by coverage volume and average factuality — not polls.",
    generatedAt: new Date().toISOString(),
    field,
    matchups,
    champion: null as PoliticianAgg | null,
  };
  if (size < 4) return empty;

  const firstRound = size === 16 ? "r16" : size === 8 ? "qf" : "sf";
  const pairs = pairClassic(field);
  const opening: BracketMatchup[] = pairs.map((pair, i) => {
    const [pa, pb] = pair;
    const { slug, reason } = leaderOf(pa, pb, revealScores);
    return {
      id: `${firstRound}-${i}`,
      round: firstRound,
      region: REGIONS[i % 4]!,
      a: { seed: seedOf(field, pa), politician: pa },
      b: { seed: seedOf(field, pb), politician: pb },
      leaderSlug: slug,
      leaderReason: reason,
    };
  });
  matchups.push(...opening);

  // Advance until championship
  let current = opening;
  const nextRound = (r: BracketRoundId): BracketRoundId | null =>
    r === "r16" ? "qf" : r === "qf" ? "sf" : r === "sf" ? "final" : null;
  let r: BracketRoundId | null = nextRound(firstRound);
  while (r && current.length >= 2) {
    const advanced = advanceRound(current, r, revealScores, field);
    matchups.push(...advanced);
    current = advanced;
    r = nextRound(r);
  }

  let champion: PoliticianAgg | null = null;
  const fin = matchups.filter((m) => m.round === "final");
  if (fin[0]?.leaderSlug) {
    champion = field.find((p) => p.slug === fin[0]!.leaderSlug) ?? null;
  }

  return {
    ...empty,
    matchups,
    champion: revealScores ? champion : null,
  };
}

function seedOf(field: PoliticianAgg[], p: PoliticianAgg | null): number {
  if (!p) return 0;
  const i = field.findIndex((x) => x.slug === p.slug);
  return i >= 0 ? i + 1 : 0;
}

function advanceRound(
  prev: BracketMatchup[],
  round: BracketRoundId,
  revealScores: boolean,
  field: PoliticianAgg[]
): BracketMatchup[] {
  const out: BracketMatchup[] = [];
  for (let i = 0; i < prev.length; i += 2) {
    const left = prev[i];
    const right = prev[i + 1];
    if (!left || !right) break;
    const pick = (m: BracketMatchup): PoliticianAgg | null => {
      if (m.leaderSlug) return field.find((p) => p.slug === m.leaderSlug) ?? m.a.politician;
      // Locked: show higher seed as tentative slot filler without declaring a leader
      const a = m.a.politician;
      const b = m.b.politician;
      if (!a) return b;
      if (!b) return a;
      return m.a.seed <= m.b.seed ? a : b;
    };
    const pa = pick(left);
    const pb = pick(right);
    const { slug, reason } = leaderOf(pa, pb, revealScores);
    out.push({
      id: `${round}-${out.length}`,
      round,
      region: left.region,
      a: { seed: seedOf(field, pa), politician: pa },
      b: { seed: seedOf(field, pb), politician: pb },
      leaderSlug: slug,
      leaderReason: reason,
    });
  }
  return out;
}

export function roundLabel(r: BracketRoundId): string {
  switch (r) {
    case "r16":
      return "Round of 16";
    case "qf":
      return "Quarterfinals";
    case "sf":
      return "Semifinals";
    case "final":
      return "Championship";
  }
}

export { ROUND_ORDER };
