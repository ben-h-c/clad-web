/**
 * Party-control + 2026 outlook layer for the elections map.
 *
 * This is an editorial snapshot for glanceability — NOT CladFacts grades,
 * NOT a poll, and NOT a prediction market. Ratings are Cook-style bands
 * (solid / likely / lean / toss-up) based on public consensus as of
 * FORECAST_ASOF. Update when major ratings shift.
 */
import { US_STATE_CODES, US_STATE_NAMES } from "./usMapPaths.ts";
import { CLASS_II_STATES, GOVERNOR_2026_STATES } from "./electionMap.ts";

export const FORECAST_ASOF = "2026-07-14";

export type Party = "D" | "R" | "S" | "N"; // Dem, Rep, Split, None/N/A
export type Rating =
  | "solid-d"
  | "likely-d"
  | "lean-d"
  | "tossup"
  | "lean-r"
  | "likely-r"
  | "solid-r"
  | "no-race";

export type ForecastLayer = "senate" | "governor" | "house" | "control";

export interface LayerForecast {
  /** Who holds the seat / controls the chamber slice now */
  current: Party;
  /** Who is favored to win / hold after 2026 (no-race if not on ballot) */
  rating: Rating;
  /** Short human label for the panel */
  label: string;
  /** True if rating party ≠ current party, or toss-up with a held seat */
  flipRisk: boolean;
  /** Optional favorite name for display */
  favored?: string;
  note?: string;
}

export interface StateForecast {
  code: string;
  name: string;
  senate: LayerForecast;
  governor: LayerForecast;
  house: LayerForecast;
  /** Rough state-government lean: governor + legislature (simplified) */
  control: LayerForecast;
}

const R = (rating: Rating, current: Party, label: string, extra?: Partial<LayerForecast>): LayerForecast => {
  const favoredParty =
    rating === "no-race"
      ? null
      : rating.includes("-d")
        ? "D"
        : rating.includes("-r")
          ? "R"
          : rating === "tossup"
            ? null
            : null;
  const flipRisk =
    rating !== "no-race" &&
    current !== "N" &&
    current !== "S" &&
    (rating === "tossup" || (favoredParty != null && favoredParty !== current));
  return { current, rating, label, flipRisk, ...extra };
};

/** Class II Senate seat holder going into 2026 (party). */
const SENATE_HOLDER: Record<string, Party> = {
  AL: "R", AK: "R", AR: "R", CO: "D", DE: "D", GA: "D", ID: "R", IL: "D", IA: "R",
  KS: "R", KY: "R", LA: "R", ME: "R", MA: "D", MI: "D", MN: "D", MS: "R", MT: "R",
  NE: "R", NH: "D", NJ: "D", NM: "D", NC: "R", OK: "R", OR: "D", RI: "D", SC: "R",
  SD: "R", TN: "R", TX: "R", VA: "D", WV: "R", WY: "R",
};

/**
 * 2026 Senate Class II outlook (states with a race only).
 * Others get no-race.
 */
const SENATE_RATING: Record<string, { rating: Rating; favored?: string; note?: string }> = {
  // Marquee / competitive
  GA: { rating: "tossup", favored: "Ossoff (D) vs Collins (R)", note: "Incumbent Ossoff; Collins is GOP nominee." },
  NC: { rating: "tossup", favored: "Cooper (D) vs Whatley (R)", note: "Open seat after Tillis retirement." },
  MI: { rating: "tossup", favored: "Dem primary → Rogers (R)", note: "Open seat (Peters). Aug primary on Dem side." },
  ME: { rating: "lean-r", favored: "Collins (R)", note: "Dem nominee TBD after Platner withdrawal." },
  TX: { rating: "likely-r", favored: "Paxton (R)", note: "Paxton beat Cornyn in runoff; Talarico is Dem nominee." },
  NH: { rating: "tossup", favored: "Pappas (D) vs GOP field", note: "Open seat (Shaheen)." },
  MN: { rating: "likely-d", favored: "Dem field", note: "Open seat (Smith); Aug primary." },
  MT: { rating: "likely-r", favored: "Daines (R)" },
  NE: { rating: "solid-r", favored: "Ricketts (R)" },
  CO: { rating: "likely-d", favored: "Hickenlooper (D)" },
  NJ: { rating: "solid-d", favored: "Booker (D)" },
  IL: { rating: "solid-d", favored: "Dem field", note: "Open seat (Durbin)." },
  SC: { rating: "solid-r", favored: "GOP nominee TBD", note: "Special calendar after Graham’s death; Andrews is Dem nominee." },
  // Remaining Class II — quieter seats
  AL: { rating: "solid-r", favored: "Tuberville (R)" },
  AK: { rating: "likely-r", favored: "Sullivan (R)" },
  AR: { rating: "solid-r", favored: "Boozman (R)" },
  DE: { rating: "solid-d", favored: "Coons (D)" },
  ID: { rating: "solid-r", favored: "Risch (R)" },
  IA: { rating: "likely-r", favored: "Ernst (R)" },
  KS: { rating: "solid-r", favored: "Marshall (R)" },
  KY: { rating: "solid-r", favored: "McConnell (R)" },
  LA: { rating: "solid-r", favored: "Cassidy (R)" },
  MA: { rating: "solid-d", favored: "Markey (D)" },
  MS: { rating: "solid-r", favored: "Wicker (R)" },
  NM: { rating: "likely-d", favored: "Heinrich (D)" },
  OK: { rating: "solid-r", favored: "Lankford (R)" },
  OR: { rating: "solid-d", favored: "Wyden (D)" },
  RI: { rating: "solid-d", favored: "Reed (D)" },
  SD: { rating: "solid-r", favored: "Rounds (R)" },
  TN: { rating: "solid-r", favored: "Hagerty (R)" },
  VA: { rating: "likely-d", favored: "Warner (D)" },
  WV: { rating: "solid-r", favored: "Capito (R)" },
  WY: { rating: "solid-r", favored: "Barrasso (R)" },
};

/** Sitting governor party (approx. 2026). */
const GOV_HOLDER: Record<string, Party> = {
  AL: "R", AK: "R", AZ: "D", AR: "R", CA: "D", CO: "D", CT: "D", DE: "D", FL: "R",
  GA: "R", HI: "D", ID: "R", IL: "D", IN: "R", IA: "R", KS: "D", KY: "D", LA: "R",
  ME: "D", MD: "D", MA: "D", MI: "D", MN: "D", MS: "R", MO: "R", MT: "R", NE: "R",
  NV: "R", NH: "R", NJ: "D", NM: "D", NY: "D", NC: "D", ND: "R", OH: "R", OK: "R",
  OR: "D", PA: "D", RI: "D", SC: "R", SD: "R", TN: "R", TX: "R", UT: "R", VT: "R",
  VA: "R", WA: "D", WV: "R", WI: "D", WY: "R", DC: "D",
};

/** 2026 governor outlook (only states on the ballot). */
const GOV_RATING: Record<string, { rating: Rating; favored?: string; note?: string }> = {
  AZ: { rating: "tossup", favored: "Hobbs (D) vs Lake (R)" },
  PA: { rating: "likely-d", favored: "Shapiro (D)" },
  MI: { rating: "lean-d", favored: "Whitmer (D)" },
  WI: { rating: "tossup", favored: "Evers (D) vs GOP field" },
  GA: { rating: "likely-r", favored: "Kemp (R)" },
  NV: { rating: "tossup", favored: "Lombardo (R) vs Dem field" },
  FL: { rating: "likely-r", favored: "GOP field", note: "Open (term limits)." },
  CO: { rating: "likely-d", favored: "Weiser (D)", note: "Open after term limits; Weiser won Dem primary." },
  // Broader 2026 map — simplified safe seats
  AL: { rating: "solid-r" }, AK: { rating: "likely-r" }, AR: { rating: "solid-r" },
  CA: { rating: "solid-d" }, CT: { rating: "solid-d" }, HI: { rating: "solid-d" },
  ID: { rating: "solid-r" }, IL: { rating: "solid-d" }, IA: { rating: "likely-r" },
  KS: { rating: "lean-d", note: "Incumbent Kelly (D) in R-leaning state." },
  ME: { rating: "lean-d" }, MD: { rating: "solid-d" }, MA: { rating: "solid-d" },
  MN: { rating: "likely-d" }, NE: { rating: "solid-r" }, NH: { rating: "tossup" },
  NM: { rating: "likely-d" }, NY: { rating: "likely-d" }, OH: { rating: "likely-r" },
  OK: { rating: "solid-r" }, OR: { rating: "likely-d" }, RI: { rating: "solid-d" },
  SC: { rating: "solid-r" }, SD: { rating: "solid-r" }, TN: { rating: "solid-r" },
  TX: { rating: "solid-r" }, VT: { rating: "likely-r", note: "Phil Scott (R) in blue state." },
  WY: { rating: "solid-r" },
};

/**
 * House lean by state — simplified from recent presidential / House delegation tilt.
 * Used for “who is favored to win more House seats here,” not district maps.
 */
const HOUSE_LEAN: Record<string, Rating> = {
  AL: "solid-r", AK: "likely-r", AZ: "tossup", AR: "solid-r", CA: "solid-d",
  CO: "lean-d", CT: "solid-d", DE: "solid-d", FL: "likely-r", GA: "tossup",
  HI: "solid-d", ID: "solid-r", IL: "likely-d", IN: "likely-r", IA: "lean-r",
  KS: "likely-r", KY: "solid-r", LA: "solid-r", ME: "lean-d", MD: "solid-d",
  MA: "solid-d", MI: "tossup", MN: "lean-d", MS: "solid-r", MO: "likely-r",
  MT: "likely-r", NE: "likely-r", NV: "tossup", NH: "lean-d", NJ: "likely-d",
  NM: "likely-d", NY: "likely-d", NC: "tossup", ND: "solid-r", OH: "lean-r",
  OK: "solid-r", OR: "likely-d", PA: "tossup", RI: "solid-d", SC: "solid-r",
  SD: "solid-r", TN: "solid-r", TX: "likely-r", UT: "solid-r", VT: "solid-d",
  VA: "lean-d", WA: "likely-d", WV: "solid-r", WI: "tossup", WY: "solid-r",
  DC: "solid-d",
};

/** House majority party in the state’s U.S. House seats (simplified). */
const HOUSE_HOLDER: Record<string, Party> = {
  AL: "R", AK: "R", AZ: "S", AR: "R", CA: "D", CO: "D", CT: "D", DE: "D", FL: "R",
  GA: "S", HI: "D", ID: "R", IL: "D", IN: "R", IA: "R", KS: "R", KY: "R", LA: "R",
  ME: "D", MD: "D", MA: "D", MI: "S", MN: "D", MS: "R", MO: "R", MT: "R", NE: "R",
  NV: "S", NH: "D", NJ: "D", NM: "D", NY: "D", NC: "R", ND: "R", OH: "R", OK: "R",
  OR: "D", PA: "S", RI: "D", SC: "R", SD: "R", TN: "R", TX: "R", UT: "R", VT: "D",
  VA: "D", WA: "D", WV: "R", WI: "S", WY: "R", DC: "D",
};

/** State government control (gov + legislature) simplified. */
const STATE_CONTROL: Record<string, Party> = {
  AL: "R", AK: "R", AZ: "S", AR: "R", CA: "D", CO: "D", CT: "D", DE: "D", FL: "R",
  GA: "R", HI: "D", ID: "R", IL: "D", IN: "R", IA: "R", KS: "S", KY: "S", LA: "R",
  ME: "D", MD: "D", MA: "D", MI: "D", MN: "D", MS: "R", MO: "R", MT: "R", NE: "R",
  NV: "S", NH: "S", NJ: "D", NM: "D", NY: "D", NC: "S", ND: "R", OH: "R", OK: "R",
  OR: "D", PA: "S", RI: "D", SC: "R", SD: "R", TN: "R", TX: "R", UT: "R", VT: "S",
  VA: "S", WA: "D", WV: "R", WI: "S", WY: "R", DC: "D",
};

function partyWord(p: Party): string {
  return p === "D" ? "Democratic" : p === "R" ? "Republican" : p === "S" ? "Split" : "—";
}

function ratingWord(r: Rating): string {
  switch (r) {
    case "solid-d": return "Solid Dem";
    case "likely-d": return "Likely Dem";
    case "lean-d": return "Lean Dem";
    case "tossup": return "Toss-up";
    case "lean-r": return "Lean GOP";
    case "likely-r": return "Likely GOP";
    case "solid-r": return "Solid GOP";
    default: return "No race";
  }
}

function favoredPartyFromRating(r: Rating): Party | null {
  if (r.includes("-d")) return "D";
  if (r.includes("-r")) return "R";
  return null;
}

function buildSenate(code: string): LayerForecast {
  if (!CLASS_II_STATES.has(code)) {
    return R("no-race", "N", "No Class II Senate race in 2026", {
      note: "This state’s next Senate elections are Class I (2030) and/or Class III (2028).",
    });
  }
  const current = SENATE_HOLDER[code] ?? "N";
  const row = SENATE_RATING[code] ?? { rating: "tossup" as Rating };
  return R(row.rating, current, `${ratingWord(row.rating)} · holds: ${partyWord(current)}`, {
    favored: row.favored,
    note: row.note,
  });
}

function buildGovernor(code: string): LayerForecast {
  if (!GOVERNOR_2026_STATES.has(code)) {
    return R("no-race", GOV_HOLDER[code] ?? "N", "No governor race in 2026", {
      note: "Governor elected on a different calendar (e.g. odd-year or off-year cycle).",
    });
  }
  const current = GOV_HOLDER[code] ?? "N";
  const row = GOV_RATING[code] ?? { rating: "tossup" as Rating };
  return R(row.rating, current, `${ratingWord(row.rating)} · holds: ${partyWord(current)}`, {
    favored: row.favored,
    note: row.note,
  });
}

function buildHouse(code: string): LayerForecast {
  const current = HOUSE_HOLDER[code] ?? "S";
  const rating = HOUSE_LEAN[code] ?? "tossup";
  return R(rating, current, `${ratingWord(rating)} · House tilt`, {
    note: "State-level House lean (not district-by-district). All 435 seats are on the ballot.",
    favored: rating === "tossup" ? "Competitive districts" : undefined,
  });
}

function buildControl(code: string): LayerForecast {
  const current = STATE_CONTROL[code] ?? "S";
  // Control map: show current dominance; “rating” mirrors lean for potential shift narrative
  const house = HOUSE_LEAN[code] ?? "tossup";
  // Map house lean → control outlook loosely
  let rating: Rating = "tossup";
  if (current === "D") rating = house.includes("-r") ? "lean-d" : house.includes("solid-d") ? "solid-d" : "likely-d";
  else if (current === "R") rating = house.includes("-d") ? "lean-r" : house.includes("solid-r") ? "solid-r" : "likely-r";
  else rating = house;

  return R(rating, current, `${partyWord(current)} state control`, {
    note: "Simplified governor + legislature trifecta lean. Not a formal forecast of every chamber.",
    flipRisk: rating === "tossup" || (favoredPartyFromRating(rating) != null && favoredPartyFromRating(rating) !== current && current !== "S"),
  });
}

// Built entirely from module-constant lookup tables — the output is identical
// on every call, so memoize it per isolate instead of rebuilding all 51 states'
// four layers on every /elections/map request.
let _forecastCache: { byCode: Record<string, StateForecast>; asOf: string } | null = null;
export function buildStateForecasts(): {
  byCode: Record<string, StateForecast>;
  asOf: string;
} {
  if (_forecastCache) return _forecastCache;
  const byCode: Record<string, StateForecast> = {};
  for (const code of US_STATE_CODES) {
    byCode[code] = {
      code,
      name: US_STATE_NAMES[code] ?? code,
      senate: buildSenate(code),
      governor: buildGovernor(code),
      house: buildHouse(code),
      control: buildControl(code),
    };
  }
  _forecastCache = { byCode, asOf: FORECAST_ASOF };
  return _forecastCache;
}

export const LAYER_LABELS: Record<ForecastLayer, string> = {
  senate: "U.S. Senate (Class II)",
  governor: "Governor",
  house: "U.S. House (state lean)",
  control: "State party control",
};

export const RATING_LEGEND: { rating: Rating; label: string; css: string }[] = [
  { rating: "solid-d", label: "Solid Dem", css: "solid-d" },
  { rating: "likely-d", label: "Likely Dem", css: "likely-d" },
  { rating: "lean-d", label: "Lean Dem", css: "lean-d" },
  { rating: "tossup", label: "Toss-up", css: "tossup" },
  { rating: "lean-r", label: "Lean GOP", css: "lean-r" },
  { rating: "likely-r", label: "Likely GOP", css: "likely-r" },
  { rating: "solid-r", label: "Solid GOP", css: "solid-r" },
  { rating: "no-race", label: "No race", css: "no-race" },
];
