/**
 * Fixed 2026 midterm race cards for Bracket v2.
 *
 * Editorial list — update when matchups firm up. Slugs should match
 * POLITICIAN_SEEDS when possible. This is NOT a poll bracket: each race
 * compares how coverage of the two sides is grading on CladFacts.
 */

export type RaceRegion = "South" | "Midwest" | "Northeast" | "West";

export type RaceTier = "marquee" | "watch" | "open";

export interface RaceSide {
  slug: string;
  name: string;
  party?: "D" | "R" | "I" | "O";
}

export interface RaceDef {
  id: string;
  office: string;
  region: RaceRegion;
  tier: RaceTier;
  a: RaceSide;
  b: RaceSide;
  /** Short editorial note (primary still open, etc.). */
  note?: string;
}

/**
 * Head-to-head (or dual-spotlight) pairings. Prefer locked generals;
 * use `note` when a side is still fluid.
 */
export const RACE_MATCHUPS: RaceDef[] = [
  {
    id: "nc-senate",
    office: "NC Senate",
    region: "South",
    tier: "marquee",
    a: { slug: "roy-cooper", name: "Roy Cooper", party: "D" },
    b: { slug: "thom-tillis", name: "Thom Tillis", party: "R" },
    note: "Top-tier open race — sides may refine as the general locks.",
  },
  {
    id: "oh-senate",
    office: "OH Senate",
    region: "Midwest",
    tier: "marquee",
    a: { slug: "sherrod-brown", name: "Sherrod Brown", party: "D" },
    b: { slug: "jon-husted", name: "Jon Husted", party: "R" },
    note: "GOP primary field can still move; Husted is our seeded focal challenger.",
  },
  {
    id: "pa-senate",
    office: "PA Senate",
    region: "Northeast",
    tier: "marquee",
    a: { slug: "bob-casey", name: "Bob Casey", party: "D" },
    b: { slug: "dave-mccormick", name: "Dave McCormick", party: "R" },
  },
  {
    id: "mi-senate",
    office: "MI Senate",
    region: "Midwest",
    tier: "marquee",
    a: { slug: "elissa-slotkin", name: "Elissa Slotkin", party: "D" },
    b: { slug: "mike-rogers", name: "Mike Rogers", party: "R" },
  },
  {
    id: "wi-senate",
    office: "WI Senate",
    region: "Midwest",
    tier: "marquee",
    a: { slug: "tammy-baldwin", name: "Tammy Baldwin", party: "D" },
    b: { slug: "eric-hovde", name: "Eric Hovde", party: "R" },
  },
  {
    id: "az-senate-open",
    office: "AZ Senate (open heat)",
    region: "West",
    tier: "marquee",
    a: { slug: "ruben-gallego", name: "Ruben Gallego", party: "D" },
    b: { slug: "kari-lake", name: "Kari Lake", party: "R" },
    note: "High-attention pairing in our seeds — confirm ballot names as the cycle firms.",
  },
  {
    id: "nv-senate",
    office: "NV Senate",
    region: "West",
    tier: "watch",
    a: { slug: "jacky-rosen", name: "Jacky Rosen", party: "D" },
    b: { slug: "sam-brown", name: "Sam Brown", party: "R" },
  },
  {
    id: "me-senate",
    office: "ME Senate",
    region: "Northeast",
    tier: "watch",
    a: { slug: "susan-collins", name: "Susan Collins", party: "R" },
    b: { slug: "graham-platner", name: "Graham Platner", party: "D" },
    note: "Dem challenger field may evolve — Platner is the current seeded focal point.",
  },
  {
    id: "tx-senate",
    office: "TX Senate",
    region: "South",
    tier: "watch",
    a: { slug: "ted-cruz", name: "Ted Cruz", party: "R" },
    b: { slug: "colin-allred", name: "Colin Allred", party: "D" },
  },
  {
    id: "mt-senate",
    office: "MT Senate",
    region: "West",
    tier: "watch",
    a: { slug: "jon-tester", name: "Jon Tester", party: "D" },
    b: { slug: "tim-sheehy", name: "Tim Sheehy", party: "R" },
  },
  {
    id: "md-senate",
    office: "MD Senate",
    region: "Northeast",
    tier: "open",
    a: { slug: "angela-alsobrooks", name: "Angela Alsobrooks", party: "D" },
    b: { slug: "larry-hogan", name: "Larry Hogan", party: "R" },
  },
  {
    id: "ga-senate-ossoff",
    office: "GA Senate (Ossoff seat)",
    region: "South",
    tier: "watch",
    a: { slug: "jon-ossoff", name: "Jon Ossoff", party: "D" },
    b: { slug: "brian-kemp", name: "Brian Kemp", party: "R" },
    note: "Kemp is governor heat + GA GOP gravity — swap when a formal Senate challenger is seeded.",
  },
  {
    id: "az-gov",
    office: "AZ Governor",
    region: "West",
    tier: "open",
    a: { slug: "katie-hobbs", name: "Katie Hobbs", party: "D" },
    b: { slug: "kari-lake", name: "Kari Lake", party: "R" },
  },
  {
    id: "pa-gov-heat",
    office: "PA Governor (heat)",
    region: "Northeast",
    tier: "open",
    a: { slug: "josh-shapiro", name: "Josh Shapiro", party: "D" },
    b: { slug: "dave-mccormick", name: "Dave McCormick", party: "R" },
    note: "McCormick may run Senate not Gov — card tracks PA statewide coverage heat until fields lock.",
  },
  {
    id: "mi-gov-heat",
    office: "MI Governor (heat)",
    region: "Midwest",
    tier: "open",
    a: { slug: "gretchen-whitmer", name: "Gretchen Whitmer", party: "D" },
    b: { slug: "mike-rogers", name: "Mike Rogers", party: "R" },
    note: "Proxy heat until a locked GOP gubernatorial nominee is seeded.",
  },
  {
    id: "wi-gov-heat",
    office: "WI Governor (heat)",
    region: "Midwest",
    tier: "open",
    a: { slug: "tony-evers", name: "Tony Evers", party: "D" },
    b: { slug: "eric-hovde", name: "Eric Hovde", party: "R" },
    note: "Hovde may be Senate-focused — statewide WI coverage proxy.",
  },
];

export const RACE_REGION_ORDER: RaceRegion[] = ["South", "Midwest", "Northeast", "West"];

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

function tierRank(t: RaceTier): number {
  return t === "marquee" ? 0 : t === "watch" ? 1 : 2;
}
