import { MIDTERMS_2026, MIDTERMS_2026_ID } from "./midterms-2026.ts";
import type { ElectionTemplate, RaceSortMode } from "./types.ts";
import {
  isVoteDateTbd,
  normalizeVoteDate,
  type RaceDef,
  type RaceVoteKind,
} from "../races.ts";
import {
  getPublishedElectionDates,
  type RaceElectionDate,
  type RaceVoteKind as AgentVoteKind,
} from "../agents.ts";

export * from "./types.ts";
export { MIDTERMS_2026, MIDTERMS_2026_ID, MIDTERMS_2026_GENERAL, MIDTERMS_2026_PICKS_CLOSE } from "./midterms-2026.ts";
export { isVoteDateTbd, normalizeVoteDate } from "../races.ts";

const ELECTIONS: Record<string, ElectionTemplate> = {
  [MIDTERMS_2026_ID]: MIDTERMS_2026,
};

export const DEFAULT_ELECTION_ID = MIDTERMS_2026_ID;

export function getElection(id: string | null | undefined): ElectionTemplate | null {
  if (!id) return MIDTERMS_2026;
  return ELECTIONS[id] ?? null;
}

/**
 * Election template with researched next-vote dates overlaid from the daily
 * race-board auditor (KV). Dates publish as soon as available; undecided → TBD.
 */
export async function getElectionWithPublishedDates(
  id: string | null | undefined,
  kv: KVNamespace | null | undefined
): Promise<ElectionTemplate | null> {
  const base = getElection(id);
  if (!base) return null;
  if (!kv) return base;
  const published = await getPublishedElectionDates(kv);
  if (!published.length) return base;
  return {
    ...base,
    races: applyPublishedElectionDates(base.races, published),
  };
}

/** Overlay auditor-researched dates onto editorial race defs. */
export function applyPublishedElectionDates(
  races: RaceDef[],
  published: RaceElectionDate[] | null | undefined
): RaceDef[] {
  if (!published?.length) return races;
  const byId = new Map(published.map((d) => [d.raceId, d]));
  return races.map((r) => {
    const p = byId.get(r.id);
    if (!p) return r;
    const next = normalizeVoteDate(p.nextVoteDate);
    const general = normalizeVoteDate(p.generalDate);
    const tbd = isVoteDateTbd(next);
    return {
      ...r,
      nextVoteDate: next,
      nextVoteTbd: tbd,
      voteKind: coerceVoteKind(p.voteKind) ?? r.voteKind,
      generalDate: isVoteDateTbd(general) ? r.generalDate : general,
    };
  });
}

function coerceVoteKind(k: AgentVoteKind | string | undefined): RaceVoteKind | undefined {
  switch (k) {
    case "primary":
    case "runoff":
    case "special":
    case "general":
    case "party-process":
    case "undecided":
      return k;
    default:
      return undefined;
  }
}

export function listActiveElections(): ElectionTemplate[] {
  return Object.values(ELECTIONS);
}

export function raceById(election: ElectionTemplate, raceId: string): RaceDef | undefined {
  return election.races.find((r) => r.id === raceId);
}

export function isValidRaceId(election: ElectionTemplate, raceId: string): boolean {
  return election.races.some((r) => r.id === raceId);
}

export function picksAreOpen(election: ElectionTemplate, now = Date.now()): boolean {
  return now < new Date(election.picksCloseAt).getTime();
}

export function daysUntil(isoDate: string | null | undefined, now = Date.now()): number {
  if (isVoteDateTbd(isoDate)) return 9999;
  const raw = String(isoDate);
  const t = Date.parse(raw.includes("T") ? raw : `${raw}T12:00:00.000Z`);
  if (Number.isNaN(t)) return 9999;
  return Math.ceil((t - now) / 86_400_000);
}

/** Combined sort: sooner votes + more coverage heat rank higher. TBD dates sort last. */
export function hotSoonScore(heat: number, nextVoteDate: string | undefined, now = Date.now()): number {
  if (isVoteDateTbd(nextVoteDate)) {
    return Math.min(heat, 200) * 3; // no “soon” boost until a date is published
  }
  const days = daysUntil(nextVoteDate ?? "2099-01-01", now);
  // Near-term races get a large boost; heat is secondary.
  const soon =
    days <= 0 ? 5000 :
    days <= 7 ? 4000 - days * 50 :
    days <= 30 ? 2500 - days * 20 :
    days <= 90 ? 800 - days * 2 :
    Math.max(0, 200 - days);
  return soon + Math.min(heat, 200) * 3;
}

export function parseSortMode(raw: string | null | undefined): RaceSortMode {
  if (raw === "soonest" || raw === "heat" || raw === "marquee" || raw === "hot-soon") return raw;
  return "hot-soon";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Short calendar label, e.g. "Aug 4" or "Nov 3, 2026". */
export function formatShortVoteDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const mon = MONTHS[month - 1] ?? m[2];
  const thisYear = new Date().getUTCFullYear();
  return year === thisYear ? `${mon} ${day}` : `${mon} ${day}, ${year}`;
}

export function voteKindLabel(kind: RaceVoteKind | string | undefined): string {
  switch (kind) {
    case "primary":
      return "Primary";
    case "runoff":
      return "Runoff";
    case "special":
      return "Special";
    case "general":
      return "General";
    case "party-process":
      return "Party process";
    case "undecided":
      return "TBD";
    default:
      return "";
  }
}

/**
 * Public chip for ballot / map: publish the calendar date ASAP, or "Date TBD".
 * e.g. "Aug 4 · Primary", "Nov 3 · General", "Date TBD".
 */
export function voteDateChip(def: Pick<RaceDef, "nextVoteDate" | "voteKind" | "nextVoteTbd">): string {
  if (def.nextVoteTbd || isVoteDateTbd(def.nextVoteDate)) return "Date TBD";
  const when = formatShortVoteDate(def.nextVoteDate!);
  const kind = voteKindLabel(def.voteKind);
  return kind ? `${when} · ${kind}` : when;
}
