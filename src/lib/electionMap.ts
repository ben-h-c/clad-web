/**
 * State-level midterm map data — merges constitutional cadence with our
 * editorial race board + live coverage heat.
 */
import type { RaceCardLive } from "./bracket.ts";
import type { RaceChamber, RaceStatus, RaceTier } from "./races.ts";
import { US_STATE_CODES, US_STATE_NAMES } from "./usMapPaths.ts";

/** Class II Senate seats on the 2026 ballot (terms end Jan 2027). */
export const CLASS_II_STATES = new Set([
  "AL", "AK", "AR", "CO", "DE", "GA", "ID", "IL", "IA", "KS", "KY", "LA", "ME",
  "MA", "MI", "MN", "MS", "MT", "NE", "NH", "NJ", "NM", "NC", "OK", "OR", "RI",
  "SC", "SD", "TN", "TX", "VA", "WV", "WY",
]);

/**
 * States electing a governor in 2026 (typical midterm calendar).
 * Off-year exceptions (not 2026): VA, NJ (odd years); KY, LA, MS (odd off-years).
 */
export const GOVERNOR_2026_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "FL", "GA", "HI", "ID", "IL", "IA",
  "KS", "ME", "MD", "MA", "MI", "MN", "NE", "NV", "NH", "NM", "NY", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "VT", "WI", "WY",
]);

export type MapFillKind =
  | "hot" // high coverage heat on our board
  | "marquee"
  | "watch"
  | "lean"
  | "senate" // Class II, not on our featured board
  | "governor" // gov 2026, no senate class II / no board card
  | "quiet"; // House only / no major statewide card

export interface StateRaceLine {
  id: string;
  office: string;
  chamber: RaceChamber;
  status: RaceStatus;
  tier: RaceTier;
  heat: number;
  /** Published next vote chip (date · kind, or Date TBD). */
  voteDateLabel?: string;
  nextVoteDate?: string;
  aName: string;
  bName: string;
  aParty?: string;
  bParty?: string;
  aSlug: string;
  bSlug: string;
  aHref: string | null;
  bHref: string | null;
  aGrade: string | null;
  bGrade: string | null;
  aLean: number | null;
  bLean: number | null;
  leaderSlug: string | null;
  note?: string;
}

export interface StateMapCell {
  code: string;
  name: string;
  classII: boolean;
  governor2026: boolean;
  house: true; // always true in midterms
  races: StateRaceLine[];
  heat: number;
  fill: MapFillKind;
  /** Short chips for the map hover label */
  chips: string[];
  /** One-line teaser */
  glance: string;
  hasBoardCard: boolean;
}

function tierRank(t: RaceTier): number {
  return t === "marquee" ? 0 : t === "watch" ? 1 : 2;
}

function fillFor(cell: {
  heat: number;
  races: StateRaceLine[];
  classII: boolean;
  governor2026: boolean;
}): MapFillKind {
  const top = [...cell.races].sort((a, b) => tierRank(a.tier) - tierRank(b.tier))[0];
  if (cell.heat >= 8) return "hot";
  if (top?.tier === "marquee") return "marquee";
  if (top?.tier === "watch") return "watch";
  if (top?.tier === "lean") return "lean";
  if (cell.classII) return "senate";
  if (cell.governor2026) return "governor";
  return "quiet";
}

function glanceLine(cell: Omit<StateMapCell, "fill" | "glance" | "chips">): string {
  if (cell.races.length === 0) {
    if (cell.classII && cell.governor2026) {
      return "Class II Senate + governor on the ballot · House all seats";
    }
    if (cell.classII) return "Class II Senate on the ballot · House all seats";
    if (cell.governor2026) return "Governor race · House all seats";
    return "House seats only (all 435 every midterm)";
  }
  const parts = cell.races.map((r) => {
    const who =
      r.status === "open-seat"
        ? "open seat"
        : r.status === "special"
          ? "special / vacancy"
          : `${r.aName} vs ${r.bName}`;
    return `${r.chamber === "senate" ? "Senate" : "Gov"}: ${who}`;
  });
  if (cell.heat > 0) parts.push(`${cell.heat} graded reports`);
  return parts.join(" · ");
}

function chipsFor(cell: Omit<StateMapCell, "fill" | "glance" | "chips">): string[] {
  const out: string[] = [];
  if (cell.races.some((r) => r.chamber === "senate")) out.push("Senate");
  else if (cell.classII) out.push("Senate Class II");
  if (cell.races.some((r) => r.chamber === "governor")) out.push("Governor");
  else if (cell.governor2026) out.push("Governor");
  if (cell.races.some((r) => r.status === "open-seat")) out.push("Open seat");
  if (cell.races.some((r) => r.status === "special")) out.push("Special");
  if (cell.races.some((r) => r.tier === "marquee")) out.push("Marquee");
  if (cell.heat > 0) out.push(`${cell.heat} reports`);
  out.push("House");
  return out.slice(0, 5);
}

export function buildElectionMap(cards: RaceCardLive[]): {
  states: StateMapCell[];
  byCode: Record<string, StateMapCell>;
  maxHeat: number;
  stats: {
    classII: number;
    governors: number;
    boardCards: number;
    hotStates: number;
  };
} {
  const byState = new Map<string, RaceCardLive[]>();
  for (const c of cards) {
    const st = c.def.state;
    if (!byState.has(st)) byState.set(st, []);
    byState.get(st)!.push(c);
  }

  const states: StateMapCell[] = US_STATE_CODES.map((code) => {
    const list = byState.get(code) ?? [];
    const races: StateRaceLine[] = list
      .map((c) => ({
        id: c.def.id,
        office: c.def.office,
        chamber: c.def.chamber,
        status: c.def.status,
        tier: c.def.tier,
        heat: c.heat,
        voteDateLabel: c.voteDateLabel,
        nextVoteDate: c.def.nextVoteDate,
        aName: c.a.name,
        bName: c.b.name,
        aParty: c.a.party,
        bParty: c.b.party,
        aSlug: c.a.slug,
        bSlug: c.b.slug,
        aHref: c.a.href,
        bHref: c.b.href,
        aGrade: c.a.avgGrade,
        bGrade: c.b.avgGrade,
        aLean: c.a.avgLean,
        bLean: c.b.avgLean,
        leaderSlug: c.leaderSlug,
        note: c.def.note,
      }))
      .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || b.heat - a.heat);

    const heat = races.reduce((n, r) => n + r.heat, 0);
    const base = {
      code,
      name: US_STATE_NAMES[code] ?? code,
      classII: CLASS_II_STATES.has(code),
      governor2026: GOVERNOR_2026_STATES.has(code),
      house: true as const,
      races,
      heat,
      hasBoardCard: races.length > 0,
    };
    return {
      ...base,
      fill: fillFor(base),
      chips: chipsFor(base),
      glance: glanceLine(base),
    };
  });

  const byCode: Record<string, StateMapCell> = {};
  for (const s of states) byCode[s.code] = s;
  const maxHeat = Math.max(1, ...states.map((s) => s.heat));

  return {
    states,
    byCode,
    maxHeat,
    stats: {
      classII: CLASS_II_STATES.size,
      governors: GOVERNOR_2026_STATES.size,
      boardCards: cards.length,
      hotStates: states.filter((s) => s.heat > 0).length,
    },
  };
}

export const MAP_FILL_LABELS: Record<MapFillKind, string> = {
  hot: "High coverage heat",
  marquee: "Marquee race",
  watch: "Race to watch",
  lean: "On our board",
  senate: "Class II Senate",
  governor: "Governor 2026",
  quiet: "House only",
};
