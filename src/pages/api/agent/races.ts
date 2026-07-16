import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import {
  getRaceAuditReport,
  setRaceAuditReport,
  type RaceAuditReport,
  type RaceElectionDate,
  type RaceVoteKind,
} from "~/lib/agents";
import { getElectionWithPublishedDates, DEFAULT_ELECTION_ID } from "~/lib/elections";
import { normalizeVoteDate, raceBoardSnapshot, isVoteDateTbd } from "~/lib/races";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const VOTE_KINDS: RaceVoteKind[] = [
  "primary",
  "runoff",
  "special",
  "general",
  "party-process",
  "undecided",
];

function normVoteKind(raw: unknown, nextVoteDate: string): RaceVoteKind {
  const k = String(raw || "").toLowerCase();
  if ((VOTE_KINDS as string[]).includes(k)) return k as RaceVoteKind;
  return isVoteDateTbd(nextVoteDate) ? "undecided" : "general";
}

function normElectionDates(raw: unknown): RaceElectionDate[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 80).map((d: any) => {
    const nextVoteDate = normalizeVoteDate(d?.nextVoteDate);
    const generalDate = normalizeVoteDate(d?.generalDate);
    return {
      raceId: String(d?.raceId || "").slice(0, 80),
      office: String(d?.office || "").slice(0, 160),
      nextVoteDate,
      voteKind: normVoteKind(d?.voteKind, nextVoteDate),
      generalDate: isVoteDateTbd(generalDate) ? "2026-11-03" : generalDate,
      note: d?.note ? String(d.note).slice(0, 400) : undefined,
      sources: Array.isArray(d?.sources)
        ? d.sources.map((s: unknown) => String(s).slice(0, 300)).slice(0, 6)
        : undefined,
    };
  }).filter((d) => d.raceId);
}

/** GET — current race board snapshot for the auditor + last stored audit. */
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  // Snapshot includes published dates so the auditor can diff / keep them current.
  const election = await getElectionWithPublishedDates(DEFAULT_ELECTION_ID, env.AGENTS);
  const board = raceBoardSnapshot({ races: election?.races });
  const lastAudit = await getRaceAuditReport(env.AGENTS);
  return json({ board, lastAudit });
};

/** POST — store a race-board audit report from the runner (findings + electionDates). */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  let body: RaceAuditReport;
  try {
    body = (await request.json()) as RaceAuditReport;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!body || typeof body.generatedAt !== "string" || !Array.isArray(body.findings)) {
    return json({ error: "invalid report" }, 400);
  }
  const electionDates = normElectionDates(body.electionDates);
  const report: RaceAuditReport = {
    generatedAt: body.generatedAt,
    boardVerifiedAsOf: String(body.boardVerifiedAsOf || ""),
    racesAudited: Number(body.racesAudited) || 0,
    summary: String(body.summary || "").slice(0, 2000),
    findings: body.findings.slice(0, 100).map((f) => ({
      raceId: String(f.raceId || "").slice(0, 80),
      office: String(f.office || "").slice(0, 160),
      severity: f.severity === "critical" || f.severity === "stale" || f.severity === "info" ? f.severity : "info",
      issue: String(f.issue || "").slice(0, 80),
      detail: String(f.detail || "").slice(0, 1200),
      suggestedA: f.suggestedA ? String(f.suggestedA).slice(0, 160) : undefined,
      suggestedB: f.suggestedB ? String(f.suggestedB).slice(0, 160) : undefined,
      suggestedNextVoteDate: f.suggestedNextVoteDate
        ? normalizeVoteDate(String(f.suggestedNextVoteDate))
        : undefined,
      sources: Array.isArray(f.sources) ? f.sources.map((s) => String(s).slice(0, 300)).slice(0, 6) : undefined,
    })),
    electionDates,
  };
  await setRaceAuditReport(env.AGENTS, report);
  const dated = electionDates.filter((d) => d.nextVoteDate !== "TBD").length;
  return json({
    ok: true,
    findings: report.findings.length,
    electionDates: electionDates.length,
    dated,
    tbd: electionDates.length - dated,
  });
};
