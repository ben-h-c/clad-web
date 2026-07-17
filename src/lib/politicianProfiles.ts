/**
 * Person-level scores for politicians (the people, not media about them).
 *
 * - leanScore: ideology of the officeholder (-100 left … +100 right)
 * - letterGrade / factualityScore: reliability of *their* public claims
 *
 * Stored in AGENTS KV by politician-grader. SEED_PROFILES give correct leans
 * for high-signal figures immediately (e.g. Bernie is left, not coverage-avg).
 */
export interface PersonProfile {
  /** Ideology of the person: -100 strongly left … +100 strongly right. */
  leanScore: number;
  leanRationale: string;
  /** Reliability grade of their public statements / claim track record. */
  letterGrade: string | null;
  factualityScore: number | null;
  gradeRationale: string | null;
  updatedAt: string;
  source: "seed" | "agent";
}

export interface PersonProfileMap {
  updatedAt: string;
  bySlug: Record<string, PersonProfile>;
}

const PROFILES_KEY = "politicians:profiles";

/** Well-known figures — ideology only until the agent scores claim reliability.
 * Keys include both common nicknames and congress official-full slugs. */
export const SEED_PROFILES: Record<string, Pick<PersonProfile, "leanScore" | "leanRationale">> = {
  "bernie-sanders": {
    leanScore: -88,
    leanRationale: "Democratic socialist; long record of left-wing positions on healthcare, taxation, and foreign policy.",
  },
  "bernard-sanders": {
    leanScore: -88,
    leanRationale: "Democratic socialist; long record of left-wing positions on healthcare, taxation, and foreign policy.",
  },
  "alexandria-ocasio-cortez": {
    leanScore: -82,
    leanRationale: "Progressive Democrat; DSA-aligned positions on climate, housing, and economic policy.",
  },
  "aoc": {
    leanScore: -82,
    leanRationale: "Progressive Democrat (same person as Alexandria Ocasio-Cortez).",
  },
  "elizabeth-warren": {
    leanScore: -72,
    leanRationale: "Progressive Democrat; consumer protection and wealth-tax advocacy.",
  },
  "chuck-schumer": {
    leanScore: -48,
    leanRationale: "Senate Democratic leadership; mainstream center-left party positions.",
  },
  "charles-e-schumer": {
    leanScore: -48,
    leanRationale: "Senate Democratic leadership; mainstream center-left party positions.",
  },
  "hakeem-jeffries": {
    leanScore: -52,
    leanRationale: "House Democratic leadership; center-left institutional Democrat.",
  },
  "donald-trump": {
    leanScore: 72,
    leanRationale: "Republican president; nationalist-populist right positions on immigration, trade, and culture.",
  },
  "jd-vance": {
    leanScore: 68,
    leanRationale: "Republican VP; national-conservative positions on immigration, trade, and cultural issues.",
  },
  "mike-johnson": {
    leanScore: 70,
    leanRationale: "House Republican Speaker; social and fiscal conservative voting record.",
  },
  // AL-3 House (officeholder) — not the Michigan Senate candidate
  "mike-rogers": {
    leanScore: 52,
    leanRationale: "Republican U.S. Representative (AL-3); mainstream House GOP voting record.",
  },
  // Michigan U.S. Senate 2026 candidate (former MI-8 House) — distinct slug
  "mike-rogers-mi": {
    leanScore: 55,
    leanRationale:
      "Republican U.S. Senate candidate in Michigan (former MI-8 House member); center-right to conservative record.",
  },
  "john-thune": {
    leanScore: 58,
    leanRationale: "Senate Republican leadership; mainstream conservative record.",
  },
  "mitch-mcconnell": {
    leanScore: 55,
    leanRationale: "Long-serving Republican Senate leader; institutional conservative.",
  },
  "ron-desantis": {
    leanScore: 65,
    leanRationale: "Republican governor; high-profile conservative cultural and education agenda.",
  },
  "gavin-newsom": {
    leanScore: -55,
    leanRationale: "Democratic governor of California; progressive state policy record.",
  },
  "marco-rubio": {
    leanScore: 58,
    leanRationale: "Republican; conservative foreign policy and social positions.",
  },
  "ted-cruz": {
    leanScore: 72,
    leanRationale: "Republican senator; consistently right-wing voting and rhetoric.",
  },
  "amy-klobuchar": {
    leanScore: -42,
    leanRationale: "Democratic senator; mainstream center-left.",
  },
  "cory-booker": {
    leanScore: -50,
    leanRationale: "Democratic senator; progressive-to-center-left.",
  },
  "cory-a-booker": {
    leanScore: -50,
    leanRationale: "Democratic senator; progressive-to-center-left.",
  },
  "mtg": {
    leanScore: 85,
    leanRationale: "Far-right Republican House member.",
  },
  "marjorie-taylor-greene": {
    leanScore: 85,
    leanRationale: "Far-right Republican House member.",
  },
  "rfk-jr": {
    leanScore: 15,
    leanRationale: "Cross-cutting: left environmental history with right-aligned health and institutional skepticism in recent years.",
  },
  "john-roberts": {
    leanScore: 25,
    leanRationale: "Chief Justice; institutional conservative jurisprudence overall.",
  },
  "clarence-thomas": {
    leanScore: 75,
    leanRationale: "Associate Justice; originalist conservative voting bloc.",
  },
  "sonia-sotomayor": {
    leanScore: -55,
    leanRationale: "Associate Justice; liberal voting bloc.",
  },
  "elena-kagan": {
    leanScore: -45,
    leanRationale: "Associate Justice; liberal voting bloc.",
  },
  "ketanji-brown-jackson": {
    leanScore: -50,
    leanRationale: "Associate Justice; liberal voting bloc.",
  },
  "samuel-alito": {
    leanScore: 70,
    leanRationale: "Associate Justice; conservative voting bloc.",
  },
  "neil-gorsuch": {
    leanScore: 60,
    leanRationale: "Associate Justice; conservative / libertarian-leaning.",
  },
  "brett-kavanaugh": {
    leanScore: 55,
    leanRationale: "Associate Justice; conservative voting bloc.",
  },
  "amy-coney-barrett": {
    leanScore: 60,
    leanRationale: "Associate Justice; conservative voting bloc.",
  },
};

/**
 * Provisional ideology from a party letter alone (ballot race sides, etc.).
 * Used when the race card has party: "R"|"D"|"I" but no person profile yet.
 */
export function seedLeanFromParty(
  party?: string | null,
  bucket?: string
): Pick<PersonProfile, "leanScore" | "leanRationale"> | null {
  const p = (party || "").trim().toUpperCase();
  if (p === "D" || p === "DEMOCRAT" || p === "DEMOCRATIC") {
    return {
      leanScore: bucket === "House" ? -45 : -42,
      leanRationale:
        "Provisional ideology from Democratic affiliation / caucus. Full claim-record grade pending agent review.",
    };
  }
  if (p === "R" || p === "REPUBLICAN" || p === "GOP") {
    return {
      leanScore: bucket === "House" ? 48 : 45,
      leanRationale:
        "Provisional ideology from Republican affiliation / caucus. Full claim-record grade pending agent review.",
    };
  }
  if (p === "I" || p === "INDEPENDENT") {
    return {
      leanScore: 0,
      leanRationale:
        "Provisional center lean for Independent / non-caucus affiliation. Full grade pending agent review.",
    };
  }
  return null;
}

/**
 * Party / office lean when we have no named seed and no agent grade yet.
 * Parsed from race labels like "TX-21 House · R" or "Kentucky Governor · D".
 */
export function seedLeanFromOffice(opts: {
  race?: string;
  bucket?: string;
  name?: string;
}): Pick<PersonProfile, "leanScore" | "leanRationale"> | null {
  const race = opts.race || "";
  const bucket = opts.bucket || "";

  // Explicit party marker at end of race string (most roster rows)
  let party: "D" | "R" | "I" | null = null;
  const m = race.match(/(?:^|[·|,])\s*([DRI])\s*$/i);
  if (m) party = m[1]!.toUpperCase() as "D" | "R" | "I";
  else if (/\bDemocrat/i.test(race)) party = "D";
  else if (/\bRepublican/i.test(race)) party = "R";
  else if (/\bIndependent/i.test(race)) party = "I";

  // Executive principals without party in race string
  if (!party && bucket === "Executive") {
    const n = (opts.name || "").toLowerCase();
    if (n.includes("trump") || n.includes("vance") || n.includes("rubio") || n.includes("rollins"))
      party = "R";
  }

  // SCOTUS: no party label — leave to SEED_PROFILES or agent
  if (!party && bucket === "Supreme Court") return null;

  return seedLeanFromParty(party, bucket);
}

export async function getPersonProfileMap(kv: KVNamespace): Promise<PersonProfileMap | null> {
  const raw = await kv.get(PROFILES_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as PersonProfileMap;
    if (!data?.bySlug || typeof data.bySlug !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

export async function setPersonProfileMap(kv: KVNamespace, map: PersonProfileMap): Promise<void> {
  await kv.put(PROFILES_KEY, JSON.stringify(map));
}

export async function mergePersonProfiles(
  kv: KVNamespace,
  additions: Record<string, PersonProfile>
): Promise<PersonProfileMap> {
  const prev = (await getPersonProfileMap(kv)) ?? { updatedAt: "", bySlug: {} };
  const bySlug = { ...prev.bySlug };
  for (const [slug, profile] of Object.entries(additions)) {
    const s = slug.trim().toLowerCase();
    if (!s || !profile) continue;
    bySlug[s] = {
      leanScore: Math.max(-100, Math.min(100, Math.round(Number(profile.leanScore) || 0))),
      leanRationale: String(profile.leanRationale || "").slice(0, 800),
      letterGrade: profile.letterGrade ? String(profile.letterGrade).slice(0, 3) : null,
      factualityScore:
        typeof profile.factualityScore === "number"
          ? Math.max(0, Math.min(100, Math.round(profile.factualityScore)))
          : null,
      gradeRationale: profile.gradeRationale ? String(profile.gradeRationale).slice(0, 800) : null,
      updatedAt: profile.updatedAt || new Date().toISOString(),
      source: profile.source === "seed" ? "seed" : "agent",
    };
  }
  const next: PersonProfileMap = { updatedAt: new Date().toISOString(), bySlug };
  await setPersonProfileMap(kv, next);
  return next;
}

/** Resolve a profile: live agent score > KV seed > named seed > party/office lean. */
export function resolvePersonProfile(
  slug: string,
  live: PersonProfileMap | null | undefined,
  opts?: { race?: string; bucket?: string; name?: string }
): PersonProfile | null {
  const stored = live?.bySlug?.[slug];
  if (stored && typeof stored.leanScore === "number") return stored;

  const named = SEED_PROFILES[slug];
  if (named) {
    return {
      leanScore: named.leanScore,
      leanRationale: named.leanRationale,
      letterGrade: null,
      factualityScore: null,
      gradeRationale: null,
      updatedAt: "seed",
      source: "seed",
    };
  }

  const fromOffice = seedLeanFromOffice({
    race: opts?.race,
    bucket: opts?.bucket,
    name: opts?.name,
  });
  if (!fromOffice) return null;
  return {
    leanScore: fromOffice.leanScore,
    leanRationale: fromOffice.leanRationale,
    letterGrade: null,
    factualityScore: null,
    gradeRationale:
      "No agent claim-record grade yet — provisional lean only. politician-grader will upgrade.",
    updatedAt: "seed",
    source: "seed",
  };
}
