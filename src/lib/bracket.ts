/**
 * Midterms 2026 brackets.
 *
 * v1 — Coverage tournament: top people by graded volume, classic seeding.
 * v2 — Race board: fixed editorial matchups (Senate/Gov) with live coverage
 *      stats on each side. Not polls — whose coverage is grading better / denser.
 */
import type { CollectionEntry } from "astro:content";
import { buildPoliticianIndex, type PoliticianAgg } from "./politicians.ts";
import {
  CIVICS_BLURBS,
  RACE_MATCHUPS,
  racesByChamber,
  racesByRegion,
  type RaceChamber,
  type RaceDef,
  type RaceRegion,
} from "./races.ts";
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

// ── Bracket v2: fixed race matchups ─────────────────────────────────────

export interface RaceSideLive {
  slug: string;
  name: string;
  party?: string;
  reports: number;
  avgGrade: string | null;
  avgFactuality: number | null;
  href: string | null;
}

export interface RaceCardLive {
  def: RaceDef;
  a: RaceSideLive;
  b: RaceSideLive;
  /** Total graded reports mentioning either side. */
  heat: number;
  /** Leader slug when scores revealed; null for guests or ties with no data. */
  leaderSlug: string | null;
  leaderReason: string | null;
}

export interface RaceBoard {
  title: string;
  subtitle: string;
  generatedAt: string;
  cards: RaceCardLive[];
  byRegion: { region: RaceRegion; cards: RaceCardLive[] }[];
  byChamber: { chamber: RaceChamber; label: string; cards: RaceCardLive[] }[];
  hottest: RaceCardLive | null;
  civics: typeof CIVICS_BLURBS;
}

function sideLive(
  side: RaceDef["a"],
  bySlug: Map<string, PoliticianAgg>
): RaceSideLive {
  const p = bySlug.get(side.slug);
  return {
    slug: side.slug,
    name: side.name,
    party: side.party,
    reports: p?.appearances.length ?? 0,
    avgGrade: p?.avgGrade ?? null,
    avgFactuality: p?.avgFactuality ?? null,
    href: p && p.appearances.length > 0 ? `/politicians/${side.slug}/` : null,
  };
}

function raceLeader(
  a: RaceSideLive,
  b: RaceSideLive,
  reveal: boolean
): { slug: string | null; reason: string | null } {
  if (!reveal) return { slug: null, reason: null };
  if (a.reports === 0 && b.reports === 0) return { slug: null, reason: "No graded coverage yet" };
  // Score: volume first, then factuality of coverage about them.
  const score = (s: RaceSideLive) => s.reports * 1000 + (s.avgFactuality ?? 50) * 10;
  const sa = score(a);
  const sb = score(b);
  if (sa === sb) {
    if (a.reports === b.reports) return { slug: null, reason: "Tied on coverage" };
    const w = a.reports >= b.reports ? a : b;
    return { slug: w.slug, reason: "More graded reports" };
  }
  const w = sa > sb ? a : b;
  const fact = w.avgFactuality != null ? ` · avg factuality ${w.avgFactuality}` : "";
  return { slug: w.slug, reason: `${w.reports} reports${fact}` };
}

/** Build the fixed-race board with live coverage stats. */
export function buildRaceBoard(
  posts: CollectionEntry<"posts">[],
  revealScores: boolean
): RaceBoard {
  const index = buildPoliticianIndex(posts);
  const bySlug = new Map(index.map((p) => [p.slug, p]));

  const cards: RaceCardLive[] = RACE_MATCHUPS.map((def) => {
    const a = sideLive(def.a, bySlug);
    const b = sideLive(def.b, bySlug);
    const { slug, reason } = raceLeader(a, b, revealScores);
    return {
      def,
      a,
      b,
      heat: a.reports + b.reports,
      leaderSlug: slug,
      leaderReason: reason,
    };
  }).sort((x, y) => y.heat - x.heat || x.def.office.localeCompare(y.def.office));

  const byRegion = racesByRegion().map(({ region, races }) => ({
    region,
    cards: races
      .map((def) => cards.find((c) => c.def.id === def.id)!)
      .filter(Boolean)
      .sort((x, y) => y.heat - x.heat),
  }));

  const byChamber = racesByChamber().map(({ chamber, label, races }) => ({
    chamber,
    label,
    cards: races
      .map((def) => cards.find((c) => c.def.id === def.id)!)
      .filter(Boolean)
      .sort((x, y) => y.heat - x.heat || x.def.office.localeCompare(y.def.office)),
  }));

  const hottest = cards.find((c) => c.heat > 0) ?? null;

  return {
    title: "Midterms 2026 Race Board",
    subtitle:
      "Constitutionally on-cycle races for 2026 — Class II Senate seats and midterm governors — with live CladFacts coverage stats. Not a poll: each card asks whose side is getting graded airtime, and how that coverage holds up.",
    generatedAt: new Date().toISOString(),
    cards,
    byRegion,
    byChamber,
    hottest,
    civics: CIVICS_BLURBS,
  };
}

/** Guests: clear leaders so UI only shows heat/counts. */
export function maskRaceLeaders(board: RaceBoard, reveal: boolean): RaceBoard {
  if (reveal) return board;
  const clear = (c: RaceCardLive): RaceCardLive => ({
    ...c,
    leaderSlug: null,
    leaderReason: null,
  });
  return {
    ...board,
    cards: board.cards.map(clear),
    byRegion: board.byRegion.map((g) => ({ ...g, cards: g.cards.map(clear) })),
    byChamber: board.byChamber.map((g) => ({ ...g, cards: g.cards.map(clear) })),
  };
}

export function statusLabel(status: RaceDef["status"]): string {
  switch (status) {
    case "incumbent-vs-field":
      return "Incumbent · field open";
    case "open-seat":
      return "Open seat";
    case "general-projected":
      return "Projected general";
    case "special":
      return "Vacancy · special calendar";
  }
}
