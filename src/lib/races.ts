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
 * Keep `verifiedAsOf` current. The race-board-auditor agent (runner) web-searches
 * each card daily: (1) candidate correctness findings for the editor to apply by
 * hand, and (2) electionDates which publish live automatically (ISO date or TBD).
 */

/** Next meaningful vote kind — used on ballot chips and the map. */
export type RaceVoteKind =
  | "primary"
  | "runoff"
  | "special"
  | "general"
  | "party-process"
  | "undecided";

export type RaceRegion = "South" | "Midwest" | "Northeast" | "West";
export type RaceChamber = "senate" | "governor";
export type RaceTier = "marquee" | "watch" | "lean";
export type RaceStatus =
  | "incumbent-vs-field" // incumbent seeking; other party not locked
  | "open-seat" // no incumbent on ballot (retirement, term limits, death after primary, etc.)
  | "general-projected" // both major-party nominees named (primaries done)
  | "special"; // vacancy / special calendar under state law + 17th Amendment

export interface RaceSide {
  slug: string;
  name: string;
  party?: "D" | "R" | "I" | "O";
  /** true when this person currently holds the seat being contested */
  incumbent?: boolean;
  /** true when not yet the party nominee — coverage proxy only */
  field?: boolean;
  /** true when this person withdrew / lost and must not be treated as the nominee */
  withdrawn?: boolean;
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
  /** ISO date (YYYY-MM-DD) of last human audit against news / Ballotpedia. */
  verifiedAsOf?: string;
  /**
   * Next meaningful vote date (primary / runoff / special / general).
   * ISO YYYY-MM-DD, or the literal "TBD" when not yet scheduled.
   * Used to sort the ballot board by “how soon” and to publish dates.
   */
  nextVoteDate?: string;
  /** What kind of vote nextVoteDate is (primary, general, …). */
  voteKind?: RaceVoteKind;
  /** General election date for this race (usually the midterm Tuesday). */
  generalDate?: string;
  /** True when researched date was published as TBD (not decided). */
  nextVoteTbd?: boolean;
}

/** True when a vote date string is undecided / not yet published as a calendar day. */
export function isVoteDateTbd(date: string | null | undefined): boolean {
  if (date == null || date === "") return true;
  const s = String(date).trim().toUpperCase();
  return s === "TBD" || s === "TDB" || s === "UNKNOWN" || s === "UNDECIDED";
}

/** Normalize researched date: valid ISO → ISO, else "TBD". */
export function normalizeVoteDate(raw: string | null | undefined): string {
  if (raw == null || isVoteDateTbd(raw)) return "TBD";
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return "TBD";
}

/** Bump when you complete a full human pass over the board. */
export const RACE_BOARD_VERIFIED_ASOF = "2026-07-14";

/**
 * 2026 Class II Senate focus + midterm governors.
 * Last full audit: 2026-07-14 (Platner out of ME; Tillis retired NC → Cooper/Whatley;
 * Cornyn lost TX primary → Paxton/Talarico; SC vacancy after Graham’s death).
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
    verifiedAsOf: "2026-07-14",
    a: { slug: "jon-ossoff", name: "Jon Ossoff", party: "D", incumbent: true },
    b: { slug: "mike-collins", name: "Mike Collins", party: "R" },
    note: "Class II. Ossoff (Dem primary unopposed May 2026). Collins won the June 16 GOP runoff vs Derek Dooley — both are general-election nominees. Warnock is Class III (2028).",
  },
  {
    id: "nc-senate",
    office: "North Carolina U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "South",
    tier: "marquee",
    status: "general-projected",
    state: "NC",
    verifiedAsOf: "2026-07-14",
    a: { slug: "roy-cooper", name: "Roy Cooper", party: "D" },
    b: { slug: "michael-whatley", name: "Michael Whatley", party: "R" },
    note: "Class II open seat — Thom Tillis retired (not seeking re-election). March 2026 primaries: Cooper (D) and Whatley (R, former RNC chair) are the nominees.",
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
    verifiedAsOf: "2026-07-14",
    a: { slug: "haley-stevens", name: "Dem primary (Stevens / El-Sayed)", party: "D", field: true },
    b: { slug: "mike-rogers", name: "Mike Rogers", party: "R", field: true },
    note: "Class II open seat — Gary Peters not seeking re-election. Dem primary Aug 4, 2026: Haley Stevens vs Abdul El-Sayed (McMorrow suspended). Rogers is the main GOP coverage name. Elissa Slotkin is Class I (2030) — not on this ballot.",
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
    verifiedAsOf: "2026-07-14",
    a: { slug: "susan-collins", name: "Susan Collins", party: "R", incumbent: true },
    b: { slug: "me-dem-field", name: "Democratic nominee TBD (ME)", party: "D", field: true },
    note: "Class II. Collins won the GOP primary unopposed. Graham Platner won the June Dem primary but withdrew July 2026 after assault allegations — Maine Democrats must name a replacement (party process; filing window around late July). Do not list Platner as the nominee.",
  },
  {
    id: "tx-senate",
    office: "Texas U.S. Senate",
    chamber: "senate",
    senateClass: 2,
    region: "South",
    tier: "marquee",
    status: "general-projected",
    state: "TX",
    verifiedAsOf: "2026-07-14",
    a: { slug: "ken-paxton", name: "Ken Paxton", party: "R" },
    b: { slug: "james-talarico", name: "James Talarico", party: "D" },
    note: "Class II. Paxton defeated incumbent John Cornyn in the May 26, 2026 GOP runoff. Talarico won the March Dem primary (over Jasmine Crockett). Ted Cruz is Class I (2030) — not on this ballot.",
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
    verifiedAsOf: "2026-07-14",
    a: { slug: "peggy-flanagan", name: "Dem primary (Flanagan / Craig)", party: "D", field: true },
    b: { slug: "mn-gop-field", name: "GOP field (MN)", party: "R", field: true },
    note: "Class II open seat — Tina Smith retiring. Dem primary Aug 11, 2026 (Lt. Gov. Peggy Flanagan, Rep. Angie Craig lead coverage). Amy Klobuchar is Class I (2030).",
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
    verifiedAsOf: "2026-07-14",
    a: { slug: "chris-pappas", name: "Chris Pappas", party: "D", field: true },
    b: { slug: "john-sununu", name: "GOP field (Sununu / Brown)", party: "R", field: true },
    note: "Class II open seat — Jeanne Shaheen retiring. Primaries Sept 8, 2026. Coverage stand-ins: Rep. Chris Pappas (D); former Sen. John E. Sununu and Scott Brown lead GOP coverage. Update when nominees lock.",
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
    verifiedAsOf: "2026-07-14",
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
    verifiedAsOf: "2026-07-14",
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
    verifiedAsOf: "2026-07-14",
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
    verifiedAsOf: "2026-07-14",
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
    verifiedAsOf: "2026-07-14",
    a: { slug: "dick-durbin", name: "Dick Durbin seat (open)", party: "D", field: true },
    b: { slug: "il-gop-field", name: "GOP field (IL)", party: "R", field: true },
    note: "Class II open seat — Dick Durbin not seeking re-election. Safe on paper for Democrats; national coverage continues.",
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
    verifiedAsOf: "2026-07-14",
    a: { slug: "sc-gop-field", name: "GOP special primary (SC)", party: "R", field: true },
    b: { slug: "annie-andrews", name: "Annie Andrews", party: "D" },
    note: "Class II vacancy after Sen. Lindsey Graham’s death (July 11, 2026). Gov. McMaster appointed Darline Graham Nordone interim. Special GOP primary Aug 11 (runoff Aug 25 if needed) for the Nov ballot. Annie Andrews is the Democratic nominee.",
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
    verifiedAsOf: "2026-07-14",
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
    verifiedAsOf: "2026-07-14",
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
    verifiedAsOf: "2026-07-14",
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
    verifiedAsOf: "2026-07-14",
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
    verifiedAsOf: "2026-07-14",
    a: { slug: "brian-kemp", name: "Brian Kemp", party: "R", incumbent: true },
    b: { slug: "ga-dem-gov-field", name: "Democratic field (GA gov)", party: "D", field: true },
    note: "Parallel to Class II Senate (Ossoff). Do not conflate with Warnock’s Class III seat (2028).",
  },
  {
    id: "nv-gov",
    office: "Nevada Governor",
    chamber: "governor",
    region: "West",
    tier: "watch",
    status: "incumbent-vs-field",
    state: "NV",
    verifiedAsOf: "2026-07-14",
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
    verifiedAsOf: "2026-07-14",
    a: { slug: "ron-desantis", name: "Term-limited / open (FL)", party: "R", field: true },
    b: { slug: "fl-dem-gov-field", name: "Democratic field (FL gov)", party: "D", field: true },
    note: "Open under state term limits after DeSantis’s second term — update sides when nominees emerge. DeSantis slug remains for coverage heat only.",
  },
  {
    id: "co-gov",
    office: "Colorado Governor",
    chamber: "governor",
    region: "West",
    tier: "watch",
    status: "open-seat",
    state: "CO",
    verifiedAsOf: "2026-07-14",
    a: { slug: "phil-weiser", name: "Phil Weiser", party: "D", field: true },
    b: { slug: "co-gop-gov-field", name: "GOP field (CO gov)", party: "R", field: true },
    note: "Open after term limits. Dem primary: Phil Weiser defeated Sen. Michael Bennet (June 2026). Separate from Hickenlooper’s Class II Senate race.",
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
    "All 435 House seats are contested every two years. We don’t card every district; national House control still dominates midterm coverage and politician report cards when figures dominate the feed.",
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

/** Snapshot for the race-board auditor agent (no coverage stats). */
export function raceBoardSnapshot(opts?: {
  /** Editorial/template races with current nextVoteDate overlays when available. */
  races?: RaceDef[];
}) {
  const list = opts?.races ?? RACE_MATCHUPS;
  return {
    verifiedAsOf: RACE_BOARD_VERIFIED_ASOF,
    races: list.map((r) => ({
      id: r.id,
      office: r.office,
      chamber: r.chamber,
      state: r.state,
      status: r.status,
      tier: r.tier,
      senateClass: r.senateClass ?? null,
      a: r.a,
      b: r.b,
      note: r.note ?? null,
      verifiedAsOf: r.verifiedAsOf ?? null,
      /** Current published/editorial next vote — auditor must refresh or set TBD. */
      nextVoteDate: r.nextVoteDate ?? null,
      voteKind: r.voteKind ?? null,
      generalDate: r.generalDate ?? null,
      nextVoteTbd: r.nextVoteTbd === true || isVoteDateTbd(r.nextVoteDate),
    })),
  };
}

function tierRank(t: RaceTier): number {
  return t === "marquee" ? 0 : t === "watch" ? 1 : 2;
}
