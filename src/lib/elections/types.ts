/**
 * Multi-cycle election templates for the Ballot Board (pick 'em).
 * Race definitions stay editorial (TypeScript); picks/results live in D1.
 */
import type { RaceDef } from "../races.ts";

export type ElectionScoring = "election-winner";

export interface ElectionTemplate {
  /** Stable id, e.g. midterms-2026 — keys D1 ballots/results. */
  id: string;
  title: string;
  subtitle: string;
  /** ISO datetime when new/changed picks stop being accepted. */
  picksCloseAt: string;
  /** ISO date of the general election day. */
  generalDate: string;
  races: RaceDef[];
  scoring: ElectionScoring;
}

export type RaceSortMode = "hot-soon" | "soonest" | "heat" | "marquee";

export type PickSide = "a" | "b";

export interface RaceResultRow {
  electionId: string;
  raceId: string;
  winnerSide: PickSide | "other";
  winnerSlug: string | null;
  winnerName: string | null;
  calledAt: string | null;
  source: string | null;
  updatedAt: string;
}

export interface UserPickRow {
  raceId: string;
  side: PickSide;
  candidateSlug: string | null;
  updatedAt: string;
}

export interface BallotScore {
  picked: number;
  total: number;
  called: number;
  correct: number;
  wrong: number;
  pending: number;
}

export function emptyScore(total: number): BallotScore {
  return { picked: 0, total, called: 0, correct: 0, wrong: 0, pending: total };
}
