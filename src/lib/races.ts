/**
 * Midterms 2026 race board — constitutionally grounded editorial list.
 *
 * ## What a midterm is (U.S. Constitution / federal structure)
 * - House: all 435 seats every two years (Art. I §2) — not listed card-by-card here.
 * - Senate: staggered 6-year terms, three classes (Art. I §3 / 17th Amendment).
 *   **2026 = Class II** (last regular election 2020; terms end Jan 3, 2027).
 *   Class III next is 2028; Class I is 2030.
 * - President: not on the ballot in midterms (Art. II / 22nd Amendment cadence).
 * - Governors: state law; most 4-year terms elected in midterm years after a presidential cycle.
 *
 * ## Senate vacancy (17th Amendment)
 * When a Senate seat opens mid-term, the 17th Amendment lets states empower the governor
 * to appoint a temporary replacement until voters fill the seat. South Carolina’s Class II
 * seat (after Lindsey Graham’s death, July 2026) follows S.C. statute for appointment +
 * special primary timing before the Nov 3, 2026 general.
 *
 * ## What this board is NOT
 * - Not a poll or prediction market.
 * - Not a claim that every pairing is locked on the general-election ballot.
 * - Coverage heat: how CladFacts has graded *broadcasts about* each side.
 *
 * Update `RACE_MATCHUPS` as primaries resolve. Prefer incumbent seat labels when
 * the challenger is still TBD.
 */

export type RaceRegion = "South" | "Midwest" | "Northeast" | "West";
export type RaceChamber = "senate" | "governor";
export type RaceTier = "marquee" | "watch" | "lean";
export type RaceStatus =
  | "incumbent-vs-field" // incumbent seeking; other party not locked
  | "open-seat" // no incumbent on ballot (retirement, term limits, death after primary, etc.)
  | "general-projected" // both sides named as leading contenders (still may face primaries)
  | "special"; // vacancy / special calendar under state law + 17th Amendment

export interface RaceSide {
  slug: string;
  name: string;
  party?: "D" | "R" | "I" | "O";
  /** true when this person currently holds the seat being contested */
  incumbent?: boolean;
  /** true when not yet the nominee — coverage proxy only */
  field?: boolean;
}

export interface RaceDef {
  id: string;
  office: string;
  chamber: RaceChamber;
  /** Senate class when chamber === senate (always 2 for this board). */
  senateClass?: 1 | 2 | 3;
  region: RaceRegion;
  tier: RaceTier;
  status: RaceStatus;
  /** State postal code */
  state: string;
  a: RaceSide;
  b: RaceSide;
  note?: string;
}

/**
 * 2026 Class II Senate focus + midterm governors.
 *
 * Corrected from earlier drafts that mislabeled:
 * - Georgia Class II = Ossoff (2026), not Warnock (Class III → 2028)
 * - Michigan Class II = Peters open seat; Slotkin is Class I (elected 2024 → 2030)
 * - Colorado Class II = Hickenlooper; Bennet is Class III (and lost the 2026 gov primary)
 * - Open seats: Peters, Smith, Shaheen, Durbin retirements; SC vacancy after Graham’s death
 */
export const RACE_MATCHUPS: RaceDef[] = [
  // ── Class II Senate — marquee / competitive attention ────────────────
  {
    id: "ga-senate",
    office: "Georgia U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "South",
    tier: "marquee",
    status: "general-projected",
    state: "GA",
    a: { slug: "jon-ossoff", name: "Jon Ossoff", party: "D", incumbent: true },
    b: { slug: "mike-collins", name: "Mike Collins", party: "R", field: true },
    note: "Class II (Ossoff, last elected in the Jan 2021 runoff for the Perdue seat). Raphael Warnock holds Georgia’s Class III seat — next regular election 2028, not 2026. Collins advanced as the leading GOP challenger in 2026 coverage.",
  },
  {
    id: "nc-senate",
    office: "North Carolina U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "South",
    tier: "marquee",
    status: "incumbent-vs-field",
    state: "NC",
    a: { slug: "thom-tillis", name: "Thom Tillis", party: "R", incumbent: true },
    b: { slug: "roy-cooper", name: "Roy Cooper", party: "D", field: true },
    note: "Class II. Cooper is the highest-coverage Democratic name in our seeds for this race; treat as contender until the primary calendar settles.",
  },
  {
    id: "mi-senate",
    office: "Michigan U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "Midwest",
    tier: "marquee",
    status: "open-seat",
    state: "MI",
    a: { slug: "haley-stevens", name: "Dem field (MI)", party: "D", field: true },
    b: { slug: "mike-rogers", name: "Mike Rogers", party: "R", field: true },
    note: "Class II open seat — Gary Peters not seeking re-election. Dem primary (e.g. Haley Stevens / Abdul El-Sayed) still settling; Rogers is the main GOP coverage name (lost the 2024 Class I race to Slotkin). Elissa Slotkin is Class I (next 2030) — not on this ballot.",
  },
  {
    id: "me-senate",
    office: "Maine U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "Northeast",
    tier: "marquee",
    status: "incumbent-vs-field",
    state: "ME",
    a: { slug: "susan-collins", name: "Susan Collins", party: "R", incumbent: true },
    b: { slug: "graham-platner", name: "Graham Platner", party: "D", field: true },
    note: "Class II. Democratic challenger field may evolve — Platner is our current seeded Dem focal point for coverage.",
  },
  {
    id: "tx-senate",
    office: "Texas U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "South",
    tier: "watch",
    status: "incumbent-vs-field",
    state: "TX",
    a: { slug: "john-cornyn", name: "John Cornyn", party: "R", incumbent: true },
    b: { slug: "colin-allred", name: "Democratic field (TX)", party: "D", field: true },
    note: "Class II is Cornyn’s seat. Ted Cruz is Class I (last elected 2024 → next regular election 2030) — not on the 2026 Senate ballot.",
  },
  {
    id: "mn-senate",
    office: "Minnesota U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "Midwest",
    tier: "watch",
    status: "open-seat",
    state: "MN",
    a: { slug: "tina-smith", name: "Tina Smith seat (open)", party: "D", field: true },
    b: { slug: "mn-gop-field", name: "GOP field (MN)", party: "R", field: true },
    note: "Class II open seat — Tina Smith announced she will not seek re-election. Amy Klobuchar is Class I (2030).",
  },
  {
    id: "nh-senate",
    office: "New Hampshire U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "Northeast",
    tier: "watch",
    status: "open-seat",
    state: "NH",
    a: { slug: "jeanne-shaheen", name: "Jeanne Shaheen seat (open)", party: "D", field: true },
    b: { slug: "nh-gop-field", name: "GOP field (NH)", party: "R", field: true },
    note: "Class II open seat — Jeanne Shaheen retiring. Competitive open-seat map; nominees TBD in our seeds.",
  },
  {
    id: "mt-senate",
    office: "Montana U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "West",
    tier: "watch",
    status: "incumbent-vs-field",
    state: "MT",
    a: { slug: "steve-daines", name: "Steve Daines", party: "R", incumbent: true },
    b: { slug: "mt-dem-field", name: "Democratic field (MT)", party: "D", field: true },
    note: "Class II is Daines. Jon Tester’s prior seat was Class I (2024 cycle) — not this race.",
  },
  {
    id: "ne-senate",
    office: "Nebraska U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "Midwest",
    tier: "lean",
    status: "incumbent-vs-field",
    state: "NE",
    a: { slug: "pete-ricketts", name: "Pete Ricketts", party: "R", incumbent: true },
    b: { slug: "ne-dem-field", name: "Democratic field (NE)", party: "D", field: true },
    note: "Class II (Ricketts). Deb Fischer is Class I (next 2030).",
  },
  {
    id: "co-senate",
    office: "Colorado U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "West",
    tier: "lean",
    status: "incumbent-vs-field",
    state: "CO",
    a: { slug: "john-hickenlooper", name: "John Hickenlooper", party: "D", incumbent: true },
    b: { slug: "co-gop-field", name: "GOP field (CO)", party: "R", field: true },
    note: "Class II is Hickenlooper (elected 2020). Michael Bennet is Class III (next 2028); he lost the 2026 Colorado governor primary and remains in the Senate through that term.",
  },
  {
    id: "nj-senate",
    office: "New Jersey U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "Northeast",
    tier: "lean",
    status: "incumbent-vs-field",
    state: "NJ",
    a: { slug: "cory-booker", name: "Cory Booker", party: "D", incumbent: true },
    b: { slug: "nj-gop-field", name: "GOP field (NJ)", party: "R", field: true },
    note: "Class II.",
  },
  {
    id: "il-senate",
    office: "Illinois U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "Midwest",
    tier: "lean",
    status: "open-seat",
    state: "IL",
    a: { slug: "dick-durbin", name: "Dick Durbin seat (open)", party: "D", field: true },
    b: { slug: "il-gop-field", name: "GOP field (IL)", party: "R", field: true },
    note: "Class II open seat — Dick Durbin not seeking re-election. Safe on paper for Democrats, still national coverage.",
  },
  {
    id: "sc-senate",
    office: "South Carolina U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "South",
    tier: "watch",
    status: "special",
    state: "SC",
    a: { slug: "sc-gop-field", name: "GOP nominee TBD (SC)", party: "R", field: true },
    b: { slug: "annie-andrews", name: "Annie Andrews", party: "D", field: true },
    note: "Class II vacancy after Sen. Lindsey Graham’s death (July 2026). 17th Amendment + S.C. law: governor may appoint an interim; state holds a special Republican primary for the Nov 2026 ballot. Democratic coverage focal point includes Dr. Annie Andrews — update when nominees lock.",
  },

  // ── Midterm governors (state law; typically 4-year terms elected 2022 → 2026) ─
  {
    id: "az-gov",
    office: "Arizona Governor",
    chamber: "governor",
    region: "West",
    tier: "marquee",
    status: "incumbent-vs-field",
    state: "AZ",
    a: { slug: "katie-hobbs", name: "Katie Hobbs", party: "D", incumbent: true },
    b: { slug: "kari-lake", name: "Kari Lake", party: "R", field: true },
    note: "No Arizona U.S. Senate seat is scheduled for 2026 (Kelly Class III → 2028; Gallego Class I → 2030).",
  },
  {
    id: "pa-gov",
    office: "Pennsylvania Governor",
    chamber: "governor",
    region: "Northeast",
    tier: "marquee",
    status: "incumbent-vs-field",
    state: "PA",
    a: { slug: "josh-shapiro", name: "Josh Shapiro", party: "D", incumbent: true },
    b: { slug: "pa-gop-field", name: "GOP field (PA)", party: "R", field: true },
    note: "No Pennsylvania U.S. Senate race in 2026 (Fetterman Class III → 2028; the other seat is Class I → 2030).",
  },
  {
    id: "mi-gov",
    office: "Michigan Governor",
    chamber: "governor",
    region: "Midwest",
    tier: "watch",
    status: "incumbent-vs-field",
    state: "MI",
    a: { slug: "gretchen-whitmer", name: "Gretchen Whitmer", party: "D", incumbent: true },
    b: { slug: "mi-gop-gov-field", name: "GOP field (MI gov)", party: "R", field: true },
    note: "Separate from the open Class II Senate race above.",
  },
  {
    id: "wi-gov",
    office: "Wisconsin Governor",
    chamber: "governor",
    region: "Midwest",
    tier: "watch",
    status: "incumbent-vs-field",
    state: "WI",
    a: { slug: "tony-evers", name: "Tony Evers", party: "D", incumbent: true },
    b: { slug: "wi-gop-gov-field", name: "GOP field (WI gov)", party: "R", field: true },
    note: "No Wisconsin U.S. Senate race in 2026 (Baldwin Class I → 2030; Johnson Class III → 2028).",
  },
  {
    id: "ga-gov",
    office: "Georgia Governor",
    chamber: "governor",
    region: "South",
    tier: "watch",
    status: "incumbent-vs-field",
    state: "GA",
    a: { slug: "brian-kemp", name: "Brian Kemp", party: "R", incumbent: true },
    b: { slug: "ga-dem-gov-field", name: "Democratic field (GA gov)", party: "D", field: true },
    note: "Parallel to Class II Senate (Ossoff). Do not conflate the governor’s race with Warnock’s Class III Senate seat (2028).",
  },
  {
    id: "nv-gov",
    office: "Nevada Governor",
    chamber: "governor",
    region: "West",
    tier: "watch",
    status: "incumbent-vs-field",
    state: "NV",
    a: { slug: "joe-lombardo", name: "Joe Lombardo", party: "R", incumbent: true },
    b: { slug: "nv-dem-gov-field", name: "Democratic field (NV gov)", party: "D", field: true },
    note: "Jacky Rosen is Class I (reelected 2024 → 2030) — not a 2026 Senate ballot.",
  },
  {
    id: "fl-gov",
    office: "Florida Governor",
    chamber: "governor",
    region: "South",
    tier: "watch",
    status: "open-seat",
    state: "FL",
    a: { slug: "ron-desantis", name: "Term-limited / open (FL)", party: "R", field: true },
    b: { slug: "fl-dem-gov-field", name: "Democratic field (FL gov)", party: "D", field: true },
    note: "Florida’s 2026 governor’s race is open under state term limits after DeSantis’s second term — update sides when nominees emerge. DeSantis slug remains for coverage heat only.",
  },
  {
    id: "co-gov",
    office: "Colorado Governor",
    chamber: "governor",
    region: "West",
    tier: "watch",
    status: "open-seat",
    state: "CO",
    a: { slug: "phil-weiser", name: "Phil Weiser", party: "D", field: true },
    b: { slug: "co-gop-gov-field", name: "GOP field (CO gov)", party: "R", field: true },
    note: "Open after term limits on the incumbent governor’s chair. Dem primary: Phil Weiser defeated Sen. Michael Bennet (June 2026). Separate from Hickenlooper’s Class II Senate race.",
  },
];

export const RACE_REGION_ORDER: RaceRegion[] = ["South", "Midwest", "Northeast", "West"];

export const CIVICS_BLURBS = {
  midterm:
    "In a federal midterm (the election halfway through a presidential term), every House seat is on the ballot and roughly one-third of the Senate (one class). The presidency is not. Governors and state legislatures follow state calendars — many large states vote for governor in midterms.",
  senateClass:
    "The Senate’s three classes exist so the whole chamber is never elected at once (Art. I §3). 2026 is Class II (terms end January 2027). Class III returns in 2028; Class I in 2030. Georgia’s Class II seat is Ossoff; Warnock is Class III.",
  vacancy:
    "If a Senate seat opens mid-term, the 17th Amendment lets each state decide how to fill it — usually a gubernatorial appointment until the next election, plus state primary rules (see South Carolina 2026).",
  notPolls:
    "These cards rank graded media coverage of each side, not voters. A “coverage lead” means more CladFacts reports (and higher average factuality of that coverage when signed in) — not a projected winner.",
  house:
    "All 435 House seats are contested every two years. We don’t card every district; national House control still dominates midterm coverage and will appear in the coverage tournament when figures dominate the feed.",
} as const;

export function racesByRegion(): { region: RaceRegion; races: RaceDef[] }[] {
  const map = new Map<RaceRegion, RaceDef[]>();
  for (const r of RACE_MATCHUPS) {
    if (!map.has(r.region)) map.set(r.region, []);
    map.get(r.region)!.push(r);
  }
  return RACE_REGION_ORDER.filter((reg) => map.has(reg)).map((region) => ({
    region,
    races: map
      .get(region)!
      .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.office.localeCompare(b.office)),
  }));
}

export function racesByChamber(): { chamber: RaceChamber; label: string; races: RaceDef[] }[] {
  const senate = RACE_MATCHUPS.filter((r) => r.chamber === "senate");
  const gov = RACE_MATCHUPS.filter((r) => r.chamber === "governor");
  return [
    { chamber: "senate", label: "U.S. Senate — Class II (2026)", races: senate },
    { chamber: "governor", label: "Governors (state midterm cycle)", races: gov },
  ];
}

function tierRank(t: RaceTier): number {
  return t === "marquee" ? 0 : t === "watch" ? 1 : 2;
}
