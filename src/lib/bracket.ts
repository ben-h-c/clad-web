/**
 * Midterms Ballot Board — fixed editorial matchups with live coverage heat +
 * sort by popularity / how soon people vote. User picks live in D1.
 * (The old coverage single-elim tournament was removed.)
 *
 * Political lean on each side is the *person’s* ideology (profile / seed /
 * party), never the average lean of media coverage that mentions them.
 */
import type { CollectionEntry } from "astro:content";
import {
  buildPoliticianIndex,
  POLITICIAN_SEEDS,
  resolvePoliticianSeeds,
  type PoliticianAgg,
  type PoliticianSeed,
} from "./politicians.ts";
import {
  getPersonProfileMap,
  seedLeanFromParty,
  type PersonProfileMap,
} from "./politicianProfiles.ts";
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
  isVoteDateTbd,
  voteDateChip,
  type RaceSortMode,
} from "./elections/index.ts";

// ── Race matchups board ──────────────────────────────────────────────────
export interface RaceSideLive {
  slug: string;
  name: string;
  party?: string;
  reports: number;
  /** Coverage-of-them average grade (media mentioning this person). */
  avgGrade: string | null;
  /** Coverage-of-them average factuality. */
  avgFactuality: number | null;
  /**
   * Person ideology (−100 left … +100 right). Prefer profile/seed, else party.
   * Shown as “Political Lean” on the ballot — never coverage-avg lean.
   */
  avgLean: number | null;
  /** Explicit alias of avgLean (person ideology). */
  personLean: number | null;
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
  /** Days until nextVoteDate (can be negative if past). Large when date is TBD. */
  daysToVote: number;
  /** Published next-vote chip: calendar date + kind, or "Date TBD". */
  voteDateLabel: string;
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
      return list.sort((x, y) => {
        // TBD dates sort after known calendar days.
        const xt = isVoteDateTbd(x.def.nextVoteDate) ? 1 : 0;
        const yt = isVoteDateTbd(y.def.nextVoteDate) ? 1 : 0;
        return (
          xt - yt ||
          x.daysToVote - y.daysToVote ||
          y.heat - x.heat ||
          x.def.office.localeCompare(y.def.office)
        );
      });
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

/** Party-only ideology when a *named* candidate has no graded person profile yet. */
function partyPersonLean(party?: string): number | null {
  const from = seedLeanFromParty(party);
  return from?.leanScore ?? null;
}

/**
 * True when this side is not a single named person — open seat, multi-candidate
 * primary, “GOP field”, “nominee TBD”, etc. Those have a party label for the
 * race card, but no person ideology to display.
 */
function isPlaceholderSide(side: RaceDef["a"]): boolean {
  if (side.slug.includes("-field")) return true;
  const n = side.name;
  // Open / unfilled labels (not a single person on the ballot yet)
  if (/\b(field|TBD|Term-limited)\b/i.test(n)) return true;
  if (/\bseat\s*\(open\)/i.test(n) || /\(\s*open\s*\)/i.test(n)) return true;
  if (/\b(Dem primary|GOP primary|Democratic nominee|Democratic field|GOP field|special primary)\b/i.test(n)) {
    return true;
  }
  // Multi-name board labels: "Stevens / El-Sayed", "Sununu / Brown"
  if (/\//.test(n)) return true;
  return false;
}

/**
 * Resolve person ideology for a race-card side.
 * Priority: named person only → profile/seed → race-card party → null.
 * Placeholders (field / TBD / multi-candidate) never get a lean.
 * Never use coverage-avg lean (media about them).
 */
function resolveSidePersonLean(
  side: RaceDef["a"],
  p: PoliticianAgg | undefined
): number | null {
  if (isPlaceholderSide(side)) return null;
  if (p?.personLean != null && Number.isFinite(p.personLean)) {
    return Math.round(p.personLean);
  }
  return partyPersonLean(side.party);
}

function sideLive(
  side: RaceDef["a"],
  bySlug: Map<string, PoliticianAgg>
): RaceSideLive {
  const p = bySlug.get(side.slug);
  const personLean = resolveSidePersonLean(side, p);
  return {
    slug: side.slug,
    name: side.name,
    party: side.party,
    reports: p?.appearances.length ?? 0,
    // Coverage metrics only — labeled “Coverage avg” in the UI.
    avgGrade: p?.coverageGrade ?? p?.avgGrade ?? null,
    avgFactuality: p?.coverageFactuality ?? p?.avgFactuality ?? null,
    // Political lean = person ideology (or party provisional).
    avgLean: personLean,
    personLean,
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
  /** Officeholder seeds (live roster preferred). Defaults to static snapshot. */
  seeds?: PoliticianSeed[];
  /** Person ideology profiles from AGENTS KV (optional). */
  profiles?: PersonProfileMap | null;
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
  const seeds = opts.seeds ?? (POLITICIAN_SEEDS as PoliticianSeed[]);
  const profiles = opts.profiles ?? null;

  // Include named race-side candidates so person profiles resolve even when
  // they are not current officeholders (e.g. MI Senate Mike Rogers). Skip
  // field / TBD / multi-candidate placeholders — they have no person lean.
  const raceSideSeeds: PoliticianSeed[] = [];
  const seen = new Set(seeds.map((s) => s.slug));
  for (const def of raceDefs) {
    for (const side of [def.a, def.b]) {
      if (!side.slug || seen.has(side.slug) || isPlaceholderSide(side)) continue;
      seen.add(side.slug);
      raceSideSeeds.push({
        name: side.name,
        slug: side.slug,
        race: side.party ? `${def.office} · ${side.party}` : def.office,
        bucket: def.chamber === "senate" ? "Senate" : "Coverage",
        // No bare-name aliases — same-name collisions (Mike Rogers AL vs MI).
        aliases: [],
      });
    }
  }
  const mergedSeeds = raceSideSeeds.length ? [...seeds, ...raceSideSeeds] : seeds;

  const index = buildPoliticianIndex(posts, mergedSeeds, profiles);
  const bySlug = new Map(index.map((p) => [p.slug, p]));

  const raw: Omit<RaceCardLive, "heatSeed">[] = raceDefs.map((def) => {
    const a = sideLive(def.a, bySlug);
    const b = sideLive(def.b, bySlug);
    const { slug, reason } = raceLeader(a, b, revealScores);
    const heat = a.reports + b.reports;
    const next = def.nextVoteDate ?? def.generalDate;
    return {
      def,
      a,
      b,
      heat,
      daysToVote: daysUntil(next),
      voteDateLabel: voteDateChip(def),
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

/**
 * Async board build: loads live roster seeds + person profiles from AGENTS KV
 * so Political Lean is person ideology (not coverage-avg) across the board.
 */
export async function buildRaceBoardLive(
  posts: CollectionEntry<"posts">[],
  opts: BuildRaceBoardOpts,
  kv?: KVNamespace
): Promise<RaceBoard> {
  const { seeds } = await resolvePoliticianSeeds(kv);
  const profiles = kv ? await getPersonProfileMap(kv) : null;
  return buildRaceBoard(posts, { ...opts, seeds, profiles });
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

/** Human label for countdown chip (when a calendar day is known). */
export function voteCountdownLabel(days: number): string {
  if (days >= 9000) return "Date TBD";
  if (days < 0) return "Vote passed";
  if (days === 0) return "Votes today";
  if (days === 1) return "1 day to vote";
  if (days < 14) return `${days} days to vote`;
  if (days < 60) return `${days} days to vote`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "1 week to vote" : `${weeks} weeks to vote`;
}

/** Prefer published calendar date (or TBD); fall back to relative countdown. */
export function raceWhenLabel(card: Pick<RaceCardLive, "voteDateLabel" | "daysToVote" | "def">): string {
  if (card.voteDateLabel) return card.voteDateLabel;
  if (isVoteDateTbd(card.def.nextVoteDate) || card.def.nextVoteTbd) return "Date TBD";
  return voteCountdownLabel(card.daysToVote);
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
