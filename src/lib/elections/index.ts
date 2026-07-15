import { MIDTERMS_2026, MIDTERMS_2026_ID } from "./midterms-2026.ts";
import type { ElectionTemplate, RaceSortMode } from "./types.ts";
import type { RaceDef } from "../races.ts";

export * from "./types.ts";
export { MIDTERMS_2026, MIDTERMS_2026_ID, MIDTERMS_2026_GENERAL, MIDTERMS_2026_PICKS_CLOSE } from "./midterms-2026.ts";

const ELECTIONS: Record<string, ElectionTemplate> = {
  [MIDTERMS_2026_ID]: MIDTERMS_2026,
};

export const DEFAULT_ELECTION_ID = MIDTERMS_2026_ID;

export function getElection(id: string | null | undefined): ElectionTemplate | null {
  if (!id) return MIDTERMS_2026;
  return ELECTIONS[id] ?? null;
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

export function daysUntil(isoDate: string, now = Date.now()): number {
  const t = Date.parse(isoDate.includes("T") ? isoDate : `${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(t)) return 999;
  return Math.ceil((t - now) / 86_400_000);
}

/** Combined sort: sooner votes + more coverage heat rank higher. */
export function hotSoonScore(heat: number, nextVoteDate: string | undefined, now = Date.now()): number {
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
