/**
 * Midterms 2026 election template — Class II Senate + midterm governors.
 * Enriches editorial RACE_MATCHUPS with next-vote / general dates for sorting.
 */
import { RACE_MATCHUPS, type RaceDef } from "../races.ts";
import type { ElectionTemplate } from "./types.ts";

export const MIDTERMS_2026_ID = "midterms-2026";
export const MIDTERMS_2026_GENERAL = "2026-11-03";
/** Picks hard-close: end of Election Day Eastern. */
export const MIDTERMS_2026_PICKS_CLOSE = "2026-11-04T04:59:59.000Z";

/**
 * Next meaningful vote when still pre-general (primary / special).
 * Omitted ids default to the general election date.
 */
const NEXT_VOTE: Record<string, string> = {
  // Senate — remaining primaries / specials
  "mi-senate": "2026-08-04",
  "mn-senate": "2026-08-11",
  "nh-senate": "2026-09-08",
  "sc-senate": "2026-08-11",
  "me-senate": "2026-11-03", // nominee TBD via party process; general is the vote
  "il-senate": "2026-11-03",
  "mt-senate": "2026-11-03",
  "ne-senate": "2026-11-03",
  "co-senate": "2026-11-03",
  "nj-senate": "2026-11-03",
  // Already general-projected → general day
  "ga-senate": "2026-11-03",
  "nc-senate": "2026-11-03",
  "tx-senate": "2026-11-03",
  // Governors
  "az-gov": "2026-11-03",
  "pa-gov": "2026-11-03",
  "mi-gov": "2026-11-03",
  "wi-gov": "2026-11-03",
  "ga-gov": "2026-11-03",
  "nv-gov": "2026-11-03",
  "fl-gov": "2026-11-03",
  "co-gov": "2026-11-03",
};

function withDates(r: RaceDef): RaceDef {
  const generalDate = r.generalDate ?? MIDTERMS_2026_GENERAL;
  const nextVoteDate = r.nextVoteDate ?? NEXT_VOTE[r.id] ?? generalDate;
  return { ...r, generalDate, nextVoteDate };
}

export const MIDTERMS_2026_RACES: RaceDef[] = RACE_MATCHUPS.map(withDates);

export const MIDTERMS_2026: ElectionTemplate = {
  id: MIDTERMS_2026_ID,
  title: "Midterms 2026 Ballot Board",
  subtitle:
    "Pick winners race-by-race — Class II Senate and midterm governors. Sorted by how hot coverage is and how soon people vote. Not polls: coverage heat is graded airtime; your picks are your calls.",
  picksCloseAt: MIDTERMS_2026_PICKS_CLOSE,
  generalDate: MIDTERMS_2026_GENERAL,
  races: MIDTERMS_2026_RACES,
  scoring: "election-winner",
};
