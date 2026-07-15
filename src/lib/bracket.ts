/**
 * Midterms boards.
 *
 * v1 — Coverage ranking: top people by graded volume (legacy tournament math kept).
 * v2 — Ballot Board: fixed editorial matchups with live coverage heat +
 *      sort by popularity / how soon the next vote is. User picks live in D1.
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
  type RaceTier,
} from "./races.ts";
import {
  daysUntil,
  hotSoonScore,
  type RaceSortMode,
} from "./elections/index.ts";
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
  avgLean: number | null;
  href: string | null;
}

export interface RaceCardLive {
  def: RaceDef;
  a: RaceSideLive;
  b: RaceSideLive;
  /** Total graded reports mentioning either side. */
  heat: number;
  /** 1 = hottest coverage on the board (cosmetic “seed”). */
  heatSeed: number;
  /** Days until nextVoteDate (can be negative if past). */
  daysToVote: number;
  /** Leader slug when scores revealed; null for guests or ties with no data. */
  leaderSlug: string | null;
  leaderReason: string | null;
}

export interface RaceBoard {
  title: string;
  subtitle: string;
  generatedAt: string;
  sortMode: RaceSortMode;
  cards: RaceCardLive[];
  byRegion: { region: RaceRegion; cards: RaceCardLive[] }[];
  byChamber: { chamber: RaceChamber; label: string; cards: RaceCardLive[] }[];
  hottest: RaceCardLive | null;
  civics: typeof CIVICS_BLURBS;
}

function tierRank(t: RaceTier): number {
  return t === "marquee" ? 0 : t === "watch" ? 1 : 2;
}

function sortCards(cards: RaceCardLive[], mode: RaceSortMode): RaceCardLive[] {
  const list = [...cards];
  switch (mode) {
    case "soonest":
      return list.sort(
        (x, y) =>
          x.daysToVote - y.daysToVote ||
          y.heat - x.heat ||
          x.def.office.localeCompare(y.def.office)
      );
    case "heat":
      return list.sort(
        (x, y) => y.heat - x.heat || x.def.office.localeCompare(y.def.office)
      );
    case "marquee":
      return list.sort(
        (x, y) =>
          tierRank(x.def.tier) - tierRank(y.def.tier) ||
          y.heat - x.heat ||
          x.def.office.localeCompare(y.def.office)
      );
    case "hot-soon":
    default:
      return list.sort((x, y) => {
        const sx = hotSoonScore(x.heat, x.def.nextVoteDate);
        const sy = hotSoonScore(y.heat, y.def.nextVoteDate);
        return sy - sx || y.heat - x.heat || x.def.office.localeCompare(y.def.office);
      });
  }
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
    avgLean: p?.avgLean ?? null,
    // Link to profile whenever we have a real person slug (photo + card), even before reports.
    href: side.slug.includes("-field") || side.slug.endsWith("-field")
      ? null
      : `/politicians/${side.slug}/`,
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

export interface BuildRaceBoardOpts {
  revealScores: boolean;
  sortMode?: RaceSortMode;
  /** When set, use these race defs (election template) instead of raw RACE_MATCHUPS. */
  races?: RaceDef[];
  title?: string;
  subtitle?: string;
}

/** Build the fixed-race board with live coverage stats + sort modes. */
export function buildRaceBoard(
  posts: CollectionEntry<"posts">[],
  revealScoresOrOpts: boolean | BuildRaceBoardOpts = true
): RaceBoard {
  const opts: BuildRaceBoardOpts =
    typeof revealScoresOrOpts === "boolean"
      ? { revealScores: revealScoresOrOpts }
      : revealScoresOrOpts;
  const revealScores = opts.revealScores;
  const sortMode: RaceSortMode = opts.sortMode ?? "hot-soon";
  const raceDefs = opts.races ?? RACE_MATCHUPS;

  const index = buildPoliticianIndex(posts);
  const bySlug = new Map(index.map((p) => [p.slug, p]));

  const raw: Omit<RaceCardLive, "heatSeed">[] = raceDefs.map((def) => {
    const a = sideLive(def.a, bySlug);
    const b = sideLive(def.b, bySlug);
    const { slug, reason } = raceLeader(a, b, revealScores);
    const heat = a.reports + b.reports;
    return {
      def,
      a,
      b,
      heat,
      daysToVote: daysUntil(def.nextVoteDate ?? def.generalDate ?? "2099-01-01"),
      leaderSlug: slug,
      leaderReason: reason,
    };
  });

  // Heat seed: rank by coverage volume (1 = hottest).
  const byHeat = [...raw].sort((x, y) => y.heat - x.heat || x.def.office.localeCompare(y.def.office));
  const seedOf = new Map(byHeat.map((c, i) => [c.def.id, i + 1]));
  const withSeed: RaceCardLive[] = raw.map((c) => ({
    ...c,
    heatSeed: seedOf.get(c.def.id) ?? raw.length,
  }));

  const cards = sortCards(withSeed, sortMode);

  const byRegion = racesByRegion().map(({ region, races }) => ({
    region,
    cards: sortCards(
      races
        .map((def) => withSeed.find((c) => c.def.id === def.id)!)
        .filter(Boolean),
      sortMode
    ),
  }));

  const byChamber = racesByChamber().map(({ chamber, label, races }) => ({
    chamber,
    label,
    cards: sortCards(
      races
        .map((def) => withSeed.find((c) => c.def.id === def.id)!)
        .filter(Boolean),
      sortMode
    ),
  }));

  const hottest = [...withSeed].sort((a, b) => b.heat - a.heat).find((c) => c.heat > 0) ?? null;

  return {
    title: opts.title ?? "Midterms 2026 Ballot Board",
    subtitle:
      opts.subtitle ??
      "Pick winners race-by-race. Cards sort by coverage heat and how soon people vote. Coverage grades are editorial context — not polls.",
    generatedAt: new Date().toISOString(),
    sortMode,
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

/** Human label for countdown chip. */
export function voteCountdownLabel(days: number): string {
  if (days < 0) return "Vote passed";
  if (days === 0) return "Votes today";
  if (days === 1) return "1 day to vote";
  if (days < 14) return `${days} days to vote`;
  if (days < 60) return `${days} days to vote`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "1 week to vote" : `${weeks} weeks to vote`;
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
