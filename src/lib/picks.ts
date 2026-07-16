/**
 * Ballot Board picks + scoring against official results (D1).
 * Picks lock per race (or filter scope) so governors can lock while senate stays open.
 */
import { env } from "cloudflare:workers";
import {
  emptyScore,
  getElection,
  isValidRaceId,
  picksAreOpen,
  raceById,
  type BallotLockScope,
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
  /**
   * Set when at least one pick is locked (enables public share).
   * Does NOT freeze every race — use pick.lockedAt for that.
   */
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

/** True when this race’s pick cannot be changed. */
export function isRacePickLocked(ballot: UserBallot, raceId: string): boolean {
  const pick = ballot.picks.find((p) => p.raceId === raceId);
  if (!pick) return false;
  if (pick.lockedAt) return true;
  // Legacy full-ballot lock (before per-pick lockedAt): every pick is frozen.
  if (ballot.lockedAt && ballot.picks.every((p) => !p.lockedAt)) return true;
  return false;
}

export function hasAnyLockedPick(ballot: UserBallot): boolean {
  if (ballot.picks.some((p) => !!p.lockedAt)) return true;
  // Legacy full lock with no per-pick timestamps
  return !!ballot.lockedAt && ballot.picks.length > 0;
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
  try {
    const res = await env.DB.prepare(
      `SELECT raceId, side, candidateSlug, updatedAt, lockedAt FROM user_pick WHERE ballotId = ?`
    )
      .bind(ballotId)
      .all<UserPickRow>();
    return (res.results ?? []).map((p) => ({
      ...p,
      lockedAt: p.lockedAt ?? null,
    }));
  } catch {
    // Column missing pre-migrate — fall back without lockedAt.
    try {
      const res = await env.DB.prepare(
        `SELECT raceId, side, candidateSlug, updatedAt FROM user_pick WHERE ballotId = ?`
      )
        .bind(ballotId)
        .all<UserPickRow>();
      return (res.results ?? []).map((p) => ({ ...p, lockedAt: null }));
    } catch {
      return [];
    }
  }
}

/**
 * Normalize legacy full-ballot locks onto picks so callers only check pick.lockedAt.
 * Best-effort backfill into D1 when possible.
 */
async function normalizePickLocks(ballot: UserBallot): Promise<UserBallot> {
  if (!ballot.lockedAt) return ballot;
  const anyPickLocked = ballot.picks.some((p) => !!p.lockedAt);
  if (anyPickLocked) return ballot;
  if (ballot.picks.length === 0) return ballot;

  // Treat all picks as locked for this response.
  const picks = ballot.picks.map((p) => ({ ...p, lockedAt: p.lockedAt || ballot.lockedAt }));
  // Backfill so community tallies and future edits see pick-level locks.
  try {
    await env.DB.prepare(
      `UPDATE user_pick SET lockedAt = ? WHERE ballotId = ? AND (lockedAt IS NULL OR lockedAt = '')`
    )
      .bind(ballot.lockedAt, ballot.id)
      .run();
  } catch {
    // Column may not exist yet
  }
  return { ...ballot, picks };
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
  const ballot: UserBallot = {
    ...row,
    picks,
    score: scorePicks(election, picks, results),
  };
  return normalizePickLocks(ballot);
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
  const ballot: UserBallot = {
    ...row,
    picks,
    score: scorePicks(election, picks, results),
  };
  return normalizePickLocks(ballot);
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
  if (isRacePickLocked(ballot, raceId)) throw new Error("race locked");

  const race = raceById(election, raceId)!;
  const candidateSlug = side === "a" ? race.a.slug : race.b.slug;
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(
      `INSERT INTO user_pick (ballotId, raceId, side, candidateSlug, updatedAt, lockedAt)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(ballotId, raceId) DO UPDATE SET
         side = excluded.side,
         candidateSlug = excluded.candidateSlug,
         updatedAt = excluded.updatedAt
       WHERE user_pick.lockedAt IS NULL`
    )
      .bind(ballot.id, raceId, side, candidateSlug, now)
      .run();
  } catch {
    // lockedAt column may not exist yet
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
  }

  await env.DB.prepare(`UPDATE user_ballot SET updatedAt = ? WHERE id = ?`)
    .bind(now, ballot.id)
    .run();

  let picks = await loadPicks(ballot.id);
  const idx = picks.findIndex((p) => p.raceId === raceId);
  const row: UserPickRow = { raceId, side, candidateSlug, updatedAt: now, lockedAt: null };
  if (idx >= 0) picks[idx] = { ...picks[idx], ...row, lockedAt: picks[idx].lockedAt ?? null };
  else picks = [...picks, row];

  const resultsFresh = await listResults(electionId);
  return {
    ...ballot,
    updatedAt: now,
    picks,
    score: scorePicks(election, picks, resultsFresh),
  };
}

function raceIdsForScope(
  election: ElectionTemplate,
  scope: BallotLockScope
): Set<string> {
  if (scope === "all") return new Set(election.races.map((r) => r.id));
  if (scope === "senate") return new Set(election.races.filter((r) => r.chamber === "senate").map((r) => r.id));
  if (scope === "governor") return new Set(election.races.filter((r) => r.chamber === "governor").map((r) => r.id));
  if (scope === "marquee") return new Set(election.races.filter((r) => r.tier === "marquee").map((r) => r.id));
  return new Set();
}

/**
 * Lock picks in a filter scope (or explicit race ids). Other races stay editable.
 * Sets ballot.lockedAt on first lock so the share URL goes live (locked picks only).
 */
export async function lockBallot(
  userId: string,
  electionId: string,
  opts?: { scope?: BallotLockScope; raceIds?: string[] }
): Promise<UserBallot> {
  const election = getElection(electionId);
  if (!election) throw new Error("unknown election");
  if (!picksAreOpen(election)) throw new Error("picks closed");

  const ballot = await ensureBallot(userId, electionId);
  const scope = opts?.scope ?? "all";
  const scopeIds = opts?.raceIds?.length
    ? new Set(opts.raceIds.filter((id) => isValidRaceId(election, id)))
    : raceIdsForScope(election, scope);

  const toLock = ballot.picks.filter(
    (p) => scopeIds.has(p.raceId) && !isRacePickLocked(ballot, p.raceId)
  );
  if (toLock.length === 0) {
    // Already locked this scope, or no picks in scope
    if (ballot.picks.some((p) => scopeIds.has(p.raceId) && isRacePickLocked(ballot, p.raceId))) {
      return ballot;
    }
    throw new Error("pick at least one race in this group before locking");
  }

  const now = new Date().toISOString();
  for (const p of toLock) {
    try {
      await env.DB.prepare(
        `UPDATE user_pick SET lockedAt = ?, updatedAt = ? WHERE ballotId = ? AND raceId = ? AND (lockedAt IS NULL OR lockedAt = '')`
      )
        .bind(now, now, ballot.id, p.raceId)
        .run();
    } catch {
      // Pre-migrate: fall back to full ballot lock
      await env.DB.prepare(`UPDATE user_ballot SET lockedAt = ?, updatedAt = ? WHERE id = ?`)
        .bind(now, now, ballot.id)
        .run();
      const legacy = await getBallotForUser(userId, electionId);
      if (!legacy) throw new Error("ballot missing");
      return legacy;
    }
  }

  // Enable share once anything is locked; do not clear later.
  await env.DB.prepare(
    `UPDATE user_ballot SET lockedAt = COALESCE(lockedAt, ?), updatedAt = ? WHERE id = ?`
  )
    .bind(now, now, ballot.id)
    .run();

  const updated = await getBallotForUser(userId, electionId);
  if (!updated) throw new Error("ballot missing");
  return updated;
}

/**
 * Clear draft (unlocked) picks. Locked picks are kept.
 * Optional scope limits which unlocked picks are cleared.
 */
export async function resetBallot(
  userId: string,
  electionId: string,
  opts?: { scope?: BallotLockScope; raceIds?: string[] }
): Promise<UserBallot> {
  const election = getElection(electionId);
  if (!election) throw new Error("unknown election");
  const ballot = await getBallotForUser(userId, electionId);
  if (!ballot) throw new Error("no ballot");

  const scope = opts?.scope ?? "all";
  const scopeIds = opts?.raceIds?.length
    ? new Set(opts.raceIds.filter((id) => isValidRaceId(election, id)))
    : raceIdsForScope(election, scope);

  const toClear = ballot.picks.filter(
    (p) => scopeIds.has(p.raceId) && !isRacePickLocked(ballot, p.raceId)
  );
  if (toClear.length === 0) {
    if (ballot.picks.some((p) => scopeIds.has(p.raceId) && isRacePickLocked(ballot, p.raceId))) {
      throw new Error("those picks are locked");
    }
    return ballot;
  }

  const now = new Date().toISOString();
  for (const p of toClear) {
    await env.DB.prepare(
      `DELETE FROM user_pick WHERE ballotId = ? AND raceId = ? AND (lockedAt IS NULL OR lockedAt = '')`
    )
      .bind(ballot.id, p.raceId)
      .run();
  }
  // Fallback delete without lockedAt filter if column missing
  try {
    // no-op if already deleted
  } catch {
    /* ignore */
  }

  await env.DB.prepare(`UPDATE user_ballot SET updatedAt = ? WHERE id = ?`)
    .bind(now, ballot.id)
    .run();
  const updated = await getBallotForUser(userId, electionId);
  if (!updated) throw new Error("ballot missing");
  return updated;
}

/** Public share: ballot has at least one locked pick; payload only includes locked picks. */
export async function getPublicSharedBallot(shareSlug: string): Promise<UserBallot | null> {
  const ballot = await getBallotByShareSlug(shareSlug);
  if (!ballot || !hasAnyLockedPick(ballot)) return null;
  const election = getElection(ballot.electionId);
  if (!election) return null;
  // After normalizePickLocks, locked picks have lockedAt set.
  let picks = ballot.picks.filter((p) => !!p.lockedAt);
  if (picks.length === 0 && ballot.lockedAt) {
    // Legacy full lock without per-pick timestamps
    picks = ballot.picks.map((p) => ({ ...p, lockedAt: p.lockedAt || ballot.lockedAt }));
  }
  if (picks.length === 0) return null;
  return {
    ...ballot,
    picks,
    score: scorePicks(election, picks, await listResults(ballot.electionId)),
  };
}

// ── Anonymous community aggregates (locked picks only) ───────────────────

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
  /** Ballots with at least one locked pick — never user identifiers. */
  lockedBallots: number;
  totalPicks: number;
  races: CommunityRaceTally[];
  generatedAt: string;
}

/**
 * Aggregate locked picks only (per-race or legacy full-ballot lock).
 */
export async function getCommunityVotes(electionId: string): Promise<CommunityVotesSummary | null> {
  const election = getElection(electionId);
  if (!election) return null;

  let lockedBallots = 0;
  const sideCounts = new Map<string, { a: number; b: number }>();

  try {
    // Prefer pick-level locks; also count legacy ballots with ballot.lockedAt.
    const locked = await env.DB.prepare(
      `SELECT COUNT(DISTINCT ub.id) as n
       FROM user_ballot ub
       LEFT JOIN user_pick up ON up.ballotId = ub.id
       WHERE ub.electionId = ?
         AND (
           up.lockedAt IS NOT NULL
           OR (ub.lockedAt IS NOT NULL)
         )`
    )
      .bind(electionId)
      .first<{ n: number }>();
    lockedBallots = Number(locked?.n ?? 0);

    // Per-pick locked tallies
    let rows = await env.DB.prepare(
      `SELECT up.raceId as raceId, up.side as side, COUNT(*) as n
       FROM user_pick up
       INNER JOIN user_ballot ub ON ub.id = up.ballotId
       WHERE ub.electionId = ?
         AND (
           up.lockedAt IS NOT NULL
           OR (ub.lockedAt IS NOT NULL AND (up.lockedAt IS NULL OR up.lockedAt = ''))
         )
       GROUP BY up.raceId, up.side`
    )
      .bind(electionId)
      .all<{ raceId: string; side: string; n: number }>();

    // If lockedAt column missing, fall back to full-ballot query
    if (!rows.results && lockedBallots === 0) {
      const locked2 = await env.DB.prepare(
        `SELECT COUNT(*) as n FROM user_ballot WHERE electionId = ? AND lockedAt IS NOT NULL`
      )
        .bind(electionId)
        .first<{ n: number }>();
      lockedBallots = Number(locked2?.n ?? 0);
      rows = await env.DB.prepare(
        `SELECT up.raceId as raceId, up.side as side, COUNT(*) as n
         FROM user_pick up
         INNER JOIN user_ballot ub ON ub.id = up.ballotId
         WHERE ub.electionId = ? AND ub.lockedAt IS NOT NULL
         GROUP BY up.raceId, up.side`
      )
        .bind(electionId)
        .all<{ raceId: string; side: string; n: number }>();
    }

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
export type { BallotLockScope };
