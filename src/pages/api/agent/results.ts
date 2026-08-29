import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getRaceCallReport, setRaceCallReport, type RaceCallLogEntry, type RaceCallReport } from "~/lib/agents";
import {
  DEFAULT_ELECTION_ID,
  getElectionWithPublishedDates,
  raceById,
} from "~/lib/elections";
import {
  decideCallAction,
  normalizeProposedCall,
  raceIsCallEligible,
  type ProposedRaceCall,
} from "~/lib/elections/raceCalls";
import { listResults, upsertRaceResult } from "~/lib/picks";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** GET — live board + current D1 calls + last consensus report. */
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const election = await getElectionWithPublishedDates(DEFAULT_ELECTION_ID, env.AGENTS);
  if (!election) return json({ error: "unknown election" }, 404);
  const results = await listResults(election.id);
  const lastReport = await getRaceCallReport(env.AGENTS);
  const eligible = election.races.filter((r) => raceIsCallEligible(r));
  return json({
    electionId: election.id,
    generalDate: election.generalDate,
    races: election.races.map((r) => ({
      id: r.id,
      office: r.office,
      chamber: r.chamber,
      state: r.state,
      status: r.status,
      voteKind: r.voteKind,
      nextVoteDate: r.nextVoteDate,
      generalDate: r.generalDate,
      a: r.a,
      b: r.b,
      eligible: raceIsCallEligible(r),
    })),
    results,
    eligibleCount: eligible.length,
    lastReport,
  });
};

/**
 * POST — apply news-consensus calls. Body: { generatedAt, summary, calls[] }.
 * Does not overwrite desk `editorial` rows. Primaries are rejected in decideCallAction.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  let body: { generatedAt?: string; summary?: string; calls?: unknown };
  try {
    body = (await request.json()) as { generatedAt?: string; summary?: string; calls?: unknown };
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const election = await getElectionWithPublishedDates(DEFAULT_ELECTION_ID, env.AGENTS);
  if (!election) return json({ error: "unknown election" }, 404);

  const rawCalls = Array.isArray(body.calls) ? body.calls : [];
  const proposed: ProposedRaceCall[] = [];
  for (const row of rawCalls.slice(0, 80)) {
    const n = normalizeProposedCall(row);
    if (n) proposed.push(n);
  }

  const existing = await listResults(election.id);
  const byRace = new Map(existing.map((r) => [r.raceId, r]));
  const now = new Date();
  const log: RaceCallLogEntry[] = [];
  let applied = 0;
  let skipped = 0;

  for (const call of proposed) {
    const race = raceById(election, call.raceId);
    const decision = decideCallAction(race, call, byRace.get(call.raceId), now);
    log.push({
      raceId: decision.raceId,
      action: decision.action,
      reason: decision.reason,
      winnerSide: decision.winnerSide,
      winnerName: decision.winnerName,
      source: decision.source,
    });
    if (decision.action === "skip" || !decision.winnerSide) {
      skipped += 1;
      continue;
    }
    try {
      const side = decision.winnerSide;
      await upsertRaceResult({
        electionId: election.id,
        raceId: call.raceId,
        winnerSide: side,
        winnerSlug:
          side === "a" ? race!.a.slug : side === "b" ? race!.b.slug : null,
        winnerName: decision.winnerName ?? null,
        source: decision.source ?? "consensus:news",
        calledAt: call.calledAt || now.toISOString(),
      });
      applied += 1;
    } catch {
      skipped += 1;
      log[log.length - 1] = { ...log[log.length - 1], action: "skip", reason: "unknown-race" };
    }
  }

  const report: RaceCallReport = {
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : now.toISOString(),
    summary: String(body.summary || "").slice(0, 2000),
    eligible: election.races.filter((r) => raceIsCallEligible(r, now)).length,
    applied,
    skipped,
    calls: log,
  };
  await setRaceCallReport(env.AGENTS, report);
  return json({ ok: true, applied, skipped, eligible: report.eligible, calls: log.length });
};
