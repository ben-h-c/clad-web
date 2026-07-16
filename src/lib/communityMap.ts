/**
 * State map of anonymous community ballot tallies.
 * Colors by who Clad readers locked as favorites — complementary to the
 * editorial party/outlook map on /elections/map/.
 */
import type { CommunityRaceTally } from "./picks.ts";
import { US_STATE_CODES, US_STATE_NAMES } from "./usMapPaths.ts";
import {
  buildStateForecasts,
  type ForecastLayer,
  type LayerForecast,
  type Rating,
} from "./electionForecast.ts";
import { CLASS_II_STATES, GOVERNOR_2026_STATES } from "./electionMap.ts";

export type CommunityMapLayer = "all" | "senate" | "governor";

/** Cook-style bands, but for community vote share (not polls). */
export type CommunityFill =
  | "solid-d"
  | "likely-d"
  | "lean-d"
  | "tossup"
  | "lean-r"
  | "likely-r"
  | "solid-r"
  | "empty";

export interface CommunityStateRace {
  raceId: string;
  office: string;
  chamber: string;
  tier: string;
  aName: string;
  bName: string;
  aParty: string | null;
  bParty: string | null;
  aCount: number;
  bCount: number;
  total: number;
  aPct: number;
  bPct: number;
  leader: "a" | "b" | "tie" | "none";
  href: string;
}

export interface CommunityStateCell {
  code: string;
  name: string;
  classII: boolean;
  governor2026: boolean;
  races: CommunityStateRace[];
  totalVotes: number;
  /** Dominant community pick party for default "all" layer */
  fill: CommunityFill;
  glance: string;
  chips: string[];
  /** Layer-specific fills */
  fillByLayer: Record<CommunityMapLayer, CommunityFill>;
  glanceByLayer: Record<CommunityMapLayer, string>;
  /** Editorial outlook for comparison (from election map) */
  outlook: {
    senate: LayerForecast;
    governor: LayerForecast;
    control: LayerForecast;
  };
  /** true if community favorite party matches outlook favored party */
  agreesByLayer: Record<CommunityMapLayer, boolean | null>;
}

function partyOfLeader(r: CommunityRaceTally): "D" | "R" | null {
  if (r.leader === "a") return r.aParty === "D" || r.aParty === "R" ? r.aParty : null;
  if (r.leader === "b") return r.bParty === "D" || r.bParty === "R" ? r.bParty : null;
  return null;
}

function margin(r: CommunityRaceTally): number {
  if (r.total <= 0) return 0;
  return Math.abs(r.aPct - r.bPct);
}

/** Map community vote margin + party → fill band (mirrors outlook legend). */
export function fillFromVotes(
  party: "D" | "R" | null,
  leadMargin: number,
  total: number
): CommunityFill {
  if (total <= 0 || !party) return "empty";
  if (leadMargin < 6) return "tossup";
  const side = party === "D" ? "d" : "r";
  if (leadMargin >= 25) return `solid-${side}` as CommunityFill;
  if (leadMargin >= 12) return `likely-${side}` as CommunityFill;
  return `lean-${side}` as CommunityFill;
}

function aggregateLayer(
  races: CommunityRaceTally[]
): { fill: CommunityFill; glance: string; party: "D" | "R" | null; total: number; margin: number } {
  const withVotes = races.filter((r) => r.total > 0);
  if (!withVotes.length) {
    return { fill: "empty", glance: "No locked community picks yet", party: null, total: 0, margin: 0 };
  }

  let dVotes = 0;
  let rVotes = 0;
  let total = 0;
  const leaders: string[] = [];
  for (const r of withVotes) {
    total += r.total;
    if (r.aParty === "D") dVotes += r.aCount;
    else if (r.aParty === "R") rVotes += r.aCount;
    if (r.bParty === "D") dVotes += r.bCount;
    else if (r.bParty === "R") rVotes += r.bCount;
    if (r.leader === "a") leaders.push(r.aName);
    else if (r.leader === "b") leaders.push(r.bName);
  }

  const partyTotal = dVotes + rVotes;
  if (partyTotal <= 0) {
    // No party tags — color by lead margin of the busiest race
    const top = [...withVotes].sort((a, b) => b.total - a.total)[0];
    const m = margin(top);
    const bySide = top.aCount >= top.bCount ? "d" : "r";
    const band =
      m < 6 ? "tossup" : m >= 25 ? `solid-${bySide}` : m >= 12 ? `likely-${bySide}` : `lean-${bySide}`;
    return {
      fill: band as CommunityFill,
      glance: `${top.office}: ${top.aPct}–${top.bPct} · ${top.total} votes`,
      party: null,
      total,
      margin: m,
    };
  }

  const dPct = Math.round((dVotes / partyTotal) * 100);
  const rPct = 100 - dPct;
  const leadMargin = Math.abs(dPct - rPct);
  const party: "D" | "R" | null = dPct === rPct ? null : dPct > rPct ? "D" : "R";
  const fill = fillFromVotes(party, leadMargin, partyTotal);
  const topNames = leaders.slice(0, 2).join(" · ");
  const glance =
    party == null
      ? `Community split ${dPct}–${rPct} · ${total} picks`
      : `Community leans ${party === "D" ? "Dem" : "GOP"} ${Math.max(dPct, rPct)}% · ${total} picks` +
        (topNames ? ` · ${topNames}` : "");

  return { fill, glance, party, total, margin: leadMargin };
}

function outlookFavoredParty(layer: LayerForecast): "D" | "R" | null {
  const r = layer.rating;
  if (r === "no-race" || r === "tossup") return null;
  if (r.includes("-d")) return "D";
  if (r.includes("-r")) return "R";
  return null;
}

function agrees(
  communityParty: "D" | "R" | null,
  outlook: LayerForecast
): boolean | null {
  if (!communityParty) return null;
  const fav = outlookFavoredParty(outlook);
  if (!fav) return null;
  return communityParty === fav;
}

export function buildCommunityVoteMap(tallies: CommunityRaceTally[]): {
  states: CommunityStateCell[];
  byCode: Record<string, CommunityStateCell>;
  lockedRaces: number;
  statesWithVotes: number;
} {
  const forecast = buildStateForecasts();
  const byState = new Map<string, CommunityRaceTally[]>();
  for (const t of tallies) {
    const st = (t.state || "").toUpperCase();
    if (!st) continue;
    if (!byState.has(st)) byState.set(st, []);
    byState.get(st)!.push(t);
  }

  let lockedRaces = 0;
  let statesWithVotes = 0;

  const states: CommunityStateCell[] = US_STATE_CODES.map((code) => {
    const list = byState.get(code) ?? [];
    const races: CommunityStateRace[] = list.map((r) => ({
      raceId: r.raceId,
      office: r.office,
      chamber: r.chamber,
      tier: r.tier,
      aName: r.aName,
      bName: r.bName,
      aParty: r.aParty,
      bParty: r.bParty,
      aCount: r.aCount,
      bCount: r.bCount,
      total: r.total,
      aPct: r.aPct,
      bPct: r.bPct,
      leader: r.leader,
      href: `/bracket/votes/${r.raceId}/`,
    }));
    const totalVotes = races.reduce((n, r) => n + r.total, 0);
    if (races.some((r) => r.total > 0)) {
      statesWithVotes += 1;
      lockedRaces += races.filter((r) => r.total > 0).length;
    }

    const senate = list.filter((r) => r.chamber === "senate");
    const governor = list.filter((r) => r.chamber === "governor");
    const allAgg = aggregateLayer(list);
    const senAgg = aggregateLayer(senate);
    const govAgg = aggregateLayer(governor);

    const fc = forecast.byCode[code];
    const outlook = {
      senate: fc?.senate ?? {
        current: "N" as const,
        rating: "no-race" as Rating,
        label: "No Class II race",
        flipRisk: false,
      },
      governor: fc?.governor ?? {
        current: "N" as const,
        rating: "no-race" as Rating,
        label: "No governor race",
        flipRisk: false,
      },
      control: fc?.control ?? {
        current: "N" as const,
        rating: "no-race" as Rating,
        label: "—",
        flipRisk: false,
      },
    };

    const chips: string[] = [];
    if (totalVotes > 0) chips.push(`${totalVotes} picks`);
    if (allAgg.party) chips.push(allAgg.party === "D" ? "Community D" : "Community R");
    if (CLASS_II_STATES.has(code)) chips.push("Senate");
    if (GOVERNOR_2026_STATES.has(code)) chips.push("Governor");

    return {
      code,
      name: US_STATE_NAMES[code] ?? code,
      classII: CLASS_II_STATES.has(code),
      governor2026: GOVERNOR_2026_STATES.has(code),
      races,
      totalVotes,
      fill: allAgg.fill,
      glance: allAgg.glance,
      chips: chips.slice(0, 5),
      fillByLayer: {
        all: allAgg.fill,
        senate: senAgg.fill,
        governor: govAgg.fill,
      },
      glanceByLayer: {
        all: allAgg.glance,
        senate: senAgg.glance,
        governor: govAgg.glance,
      },
      outlook,
      agreesByLayer: {
        all: agrees(allAgg.party, outlook.control),
        senate: agrees(senAgg.party, outlook.senate),
        governor: agrees(govAgg.party, outlook.governor),
      },
    };
  });

  const byCode: Record<string, CommunityStateCell> = {};
  for (const s of states) byCode[s.code] = s;

  return { states, byCode, lockedRaces, statesWithVotes };
}

export const COMMUNITY_FILL_LABELS: Record<CommunityFill, string> = {
  "solid-d": "Solid community Dem",
  "likely-d": "Likely community Dem",
  "lean-d": "Lean community Dem",
  tossup: "Split / close",
  "lean-r": "Lean community GOP",
  "likely-r": "Likely community GOP",
  "solid-r": "Solid community GOP",
  empty: "No locked picks",
};

export type { ForecastLayer };
