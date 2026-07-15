/**
 * Ballot Board picks + scoring against official results (D1).
 */
import { env } from "cloudflare:workers";
import {
  emptyScore,
  getElection,
  isValidRaceId,
  picksAreOpen,
  raceById,
  type BallotScore,
  type ElectionTemplate,
  type PickSide,
  type RaceResultRow,
  type UserPickRow,
} from "./elections/index.ts";

export interface UserBallot {
  id: string;
  userId: string;
  electionId: string;
  shareSlug: string;
  displayName: string | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  picks: UserPickRow[];
  score: BallotScore;
}

function shareSlug(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

export async function listResults(electionId: string): Promise<RaceResultRow[]> {
  try {
    const res = await env.DB.prepare(
      `SELECT electionId, raceId, winnerSide, winnerSlug, winnerName, calledAt, source, updatedAt
       FROM race_result WHERE electionId = ?`
    )
      .bind(electionId)
      .all<RaceResultRow>();
    return res.results ?? [];
  } catch {
    // Table may not exist yet pre-migrate.
    return [];
  }
}

export function scorePicks(
  election: ElectionTemplate,
  picks: UserPickRow[],
  results: RaceResultRow[]
): BallotScore {
  const byRace = new Map(results.map((r) => [r.raceId, r]));
  const pickMap = new Map(picks.map((p) => [p.raceId, p]));
  let correct = 0;
  let wrong = 0;
  let called = 0;
  for (const race of election.races) {
    const res = byRace.get(race.id);
    if (!res || res.winnerSide === "other") continue;
    called += 1;
    const pick = pickMap.get(race.id);
    if (!pick) continue;
    if (pick.side === res.winnerSide) correct += 1;
    else wrong += 1;
  }
  const pending = election.races.length - called;
  return {
    picked: picks.length,
    total: election.races.length,
    called,
    correct,
    wrong,
    pending,
  };
}

async function loadPicks(ballotId: string): Promise<UserPickRow[]> {
  const res = await env.DB.prepare(
    `SELECT raceId, side, candidateSlug, updatedAt FROM user_pick WHERE ballotId = ?`
  )
    .bind(ballotId)
    .all<UserPickRow>();
  return res.results ?? [];
}

export async function getBallotForUser(
  userId: string,
  electionId: string
): Promise<UserBallot | null> {
  const election = getElection(electionId);
  if (!election) return null;
  let row: {
    id: string;
    userId: string;
    electionId: string;
    shareSlug: string;
    displayName: string | null;
    lockedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  try {
    row = await env.DB.prepare(
      `SELECT id, userId, electionId, shareSlug, displayName, lockedAt, createdAt, updatedAt
       FROM user_ballot WHERE userId = ? AND electionId = ?`
    )
      .bind(userId, electionId)
      .first();
  } catch {
    return null;
  }
  if (!row) return null;
  const picks = await loadPicks(row.id);
  const results = await listResults(electionId);
  return {
    ...row,
    picks,
    score: scorePicks(election, picks, results),
  };
}

export async function getBallotByShareSlug(shareSlug: string): Promise<UserBallot | null> {
  let row: {
    id: string;
    userId: string;
    electionId: string;
    shareSlug: string;
    displayName: string | null;
    lockedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  try {
    row = await env.DB.prepare(
      `SELECT id, userId, electionId, shareSlug, displayName, lockedAt, createdAt, updatedAt
       FROM user_ballot WHERE shareSlug = ?`
    )
      .bind(shareSlug)
      .first();
  } catch {
    return null;
  }
  if (!row) return null;
  const election = getElection(row.electionId);
  if (!election) return null;
  const picks = await loadPicks(row.id);
  const results = await listResults(row.electionId);
  return {
    ...row,
    picks,
    score: scorePicks(election, picks, results),
  };
}

/** Ensure a ballot row exists; creates with a public share slug. */
export async function ensureBallot(
  userId: string,
  electionId: string,
  displayName?: string | null
): Promise<UserBallot> {
  const existing = await getBallotForUser(userId, electionId);
  if (existing) return existing;

  const election = getElection(electionId);
  if (!election) throw new Error("unknown election");

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  let slug = shareSlug();
  for (let i = 0; i < 5; i++) {
    try {
      await env.DB.prepare(
        `INSERT INTO user_ballot (id, userId, electionId, shareSlug, displayName, lockedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
      )
        .bind(id, userId, electionId, slug, displayName ?? null, now, now)
        .run();
      break;
    } catch {
      slug = shareSlug();
      if (i === 4) throw new Error("could not create ballot");
    }
  }
  const ballot = await getBallotForUser(userId, electionId);
  if (!ballot) throw new Error("ballot missing after create");
  return ballot;
}

export async function upsertPick(
  userId: string,
  electionId: string,
  raceId: string,
  side: PickSide,
  displayName?: string | null
): Promise<UserBallot> {
  const election = getElection(electionId);
  if (!election) throw new Error("unknown election");
  if (!isValidRaceId(election, raceId)) throw new Error("invalid race");
  if (side !== "a" && side !== "b") throw new Error("invalid side");

  const results = await listResults(electionId);
  if (results.some((r) => r.raceId === raceId && r.winnerSide !== "other")) {
    throw new Error("race already called");
  }
  if (!picksAreOpen(election)) {
    throw new Error("picks closed");
  }

  const ballot = await ensureBallot(userId, electionId, displayName);
  if (ballot.lockedAt) throw new Error("ballot locked");

  const race = raceById(election, raceId)!;
  const candidateSlug = side === "a" ? race.a.slug : race.b.slug;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO user_pick (ballotId, raceId, side, candidateSlug, updatedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ballotId, raceId) DO UPDATE SET
       side = excluded.side,
       candidateSlug = excluded.candidateSlug,
       updatedAt = excluded.updatedAt`
  )
    .bind(ballot.id, raceId, side, candidateSlug, now)
    .run();

  await env.DB.prepare(`UPDATE user_ballot SET updatedAt = ? WHERE id = ?`)
    .bind(now, ballot.id)
    .run();

  const updated = await getBallotForUser(userId, electionId);
  if (!updated) throw new Error("ballot missing");
  return updated;
}

export async function lockBallot(userId: string, electionId: string): Promise<UserBallot> {
  const ballot = await ensureBallot(userId, electionId);
  if (ballot.lockedAt) return ballot;
  if (ballot.picks.length === 0) throw new Error("pick at least one race before locking");
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE user_ballot SET lockedAt = ?, updatedAt = ? WHERE id = ?`)
    .bind(now, now, ballot.id)
    .run();
  const updated = await getBallotForUser(userId, electionId);
  if (!updated) throw new Error("ballot missing");
  return updated;
}

/** Clear all picks on an unlocked ballot. Locked ballots cannot be reset. */
export async function resetBallot(userId: string, electionId: string): Promise<UserBallot> {
  const ballot = await getBallotForUser(userId, electionId);
  if (!ballot) throw new Error("no ballot");
  if (ballot.lockedAt) throw new Error("ballot locked");
  const now = new Date().toISOString();
  await env.DB.prepare(`DELETE FROM user_pick WHERE ballotId = ?`).bind(ballot.id).run();
  await env.DB.prepare(`UPDATE user_ballot SET updatedAt = ? WHERE id = ?`)
    .bind(now, ballot.id)
    .run();
  const updated = await getBallotForUser(userId, electionId);
  if (!updated) throw new Error("ballot missing");
  return updated;
}

/** Public share payloads only for locked ballots (anonymous display name only). */
export async function getPublicSharedBallot(shareSlug: string): Promise<UserBallot | null> {
  const ballot = await getBallotByShareSlug(shareSlug);
  if (!ballot || !ballot.lockedAt) return null;
  return ballot;
}

// ── Anonymous community aggregates (locked ballots only) ─────────────────

export interface CommunityRaceTally {
  raceId: string;
  office: string;
  chamber: string;
  state: string;
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
  winnerSide: PickSide | "other" | null;
  winnerName: string | null;
}

export interface CommunityVotesSummary {
  electionId: string;
  title: string;
  /** Locked ballots counted — never user identifiers. */
  lockedBallots: number;
  totalPicks: number;
  races: CommunityRaceTally[];
  generatedAt: string;
}

/**
 * Aggregate locked-ballot picks only. Returns counts and percentages — never
 * user ids, emails, or individual ballots.
 */
export async function getCommunityVotes(electionId: string): Promise<CommunityVotesSummary | null> {
  const election = getElection(electionId);
  if (!election) return null;

  let lockedBallots = 0;
  const sideCounts = new Map<string, { a: number; b: number }>();

  try {
    const locked = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM user_ballot WHERE electionId = ? AND lockedAt IS NOT NULL`
    )
      .bind(electionId)
      .first<{ n: number }>();
    lockedBallots = Number(locked?.n ?? 0);

    const rows = await env.DB.prepare(
      `SELECT up.raceId as raceId, up.side as side, COUNT(*) as n
       FROM user_pick up
       INNER JOIN user_ballot ub ON ub.id = up.ballotId
       WHERE ub.electionId = ? AND ub.lockedAt IS NOT NULL
       GROUP BY up.raceId, up.side`
    )
      .bind(electionId)
      .all<{ raceId: string; side: string; n: number }>();

    for (const r of rows.results ?? []) {
      if (!sideCounts.has(r.raceId)) sideCounts.set(r.raceId, { a: 0, b: 0 });
      const e = sideCounts.get(r.raceId)!;
      if (r.side === "a") e.a += Number(r.n);
      else if (r.side === "b") e.b += Number(r.n);
    }
  } catch {
    // Tables missing pre-migrate
  }

  const results = await listResults(electionId);
  const resultByRace = new Map(results.map((r) => [r.raceId, r]));

  let totalPicks = 0;
  const races: CommunityRaceTally[] = election.races.map((race) => {
    const c = sideCounts.get(race.id) ?? { a: 0, b: 0 };
    const total = c.a + c.b;
    totalPicks += total;
    const aPct = total ? Math.round((c.a / total) * 100) : 0;
    const bPct = total ? 100 - aPct : 0;
    let leader: CommunityRaceTally["leader"] = "none";
    if (total > 0) {
      if (c.a === c.b) leader = "tie";
      else leader = c.a > c.b ? "a" : "b";
    }
    const res = resultByRace.get(race.id);
    return {
      raceId: race.id,
      office: race.office,
      chamber: race.chamber,
      state: race.state,
      tier: race.tier,
      aName: race.a.name,
      bName: race.b.name,
      aParty: race.a.party ?? null,
      bParty: race.b.party ?? null,
      aCount: c.a,
      bCount: c.b,
      total,
      aPct,
      bPct,
      leader,
      winnerSide: res?.winnerSide ?? null,
      winnerName: res?.winnerName ?? null,
    };
  });

  // Dashboard default order: most votes first, then closest races, then office
  races.sort(
    (x, y) =>
      y.total - x.total ||
      Math.abs(x.aPct - 50) - Math.abs(y.aPct - 50) ||
      x.office.localeCompare(y.office)
  );

  return {
    electionId,
    title: election.title,
    lockedBallots,
    totalPicks,
    races,
    generatedAt: new Date().toISOString(),
  };
}

export async function upsertRaceResult(input: {
  electionId: string;
  raceId: string;
  winnerSide: PickSide | "other";
  winnerSlug?: string | null;
  winnerName?: string | null;
  source?: string | null;
  calledAt?: string | null;
}): Promise<void> {
  const election = getElection(input.electionId);
  if (!election) throw new Error("unknown election");
  if (!isValidRaceId(election, input.raceId)) throw new Error("invalid race");
  if (!["a", "b", "other"].includes(input.winnerSide)) throw new Error("invalid winnerSide");

  const now = new Date().toISOString();
  const race = raceById(election, input.raceId)!;
  let winnerSlug = input.winnerSlug ?? null;
  let winnerName = input.winnerName ?? null;
  if (input.winnerSide === "a") {
    winnerSlug = winnerSlug ?? race.a.slug;
    winnerName = winnerName ?? race.a.name;
  } else if (input.winnerSide === "b") {
    winnerSlug = winnerSlug ?? race.b.slug;
    winnerName = winnerName ?? race.b.name;
  }

  await env.DB.prepare(
    `INSERT INTO race_result (electionId, raceId, winnerSide, winnerSlug, winnerName, calledAt, source, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(electionId, raceId) DO UPDATE SET
       winnerSide = excluded.winnerSide,
       winnerSlug = excluded.winnerSlug,
       winnerName = excluded.winnerName,
       calledAt = excluded.calledAt,
       source = excluded.source,
       updatedAt = excluded.updatedAt`
  )
    .bind(
      input.electionId,
      input.raceId,
      input.winnerSide,
      winnerSlug,
      winnerName,
      input.calledAt ?? now,
      input.source ?? "editorial",
      now
    )
    .run();
}

export async function clearRaceResult(electionId: string, raceId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM race_result WHERE electionId = ? AND raceId = ?`)
    .bind(electionId, raceId)
    .run();
}

export { emptyScore };
