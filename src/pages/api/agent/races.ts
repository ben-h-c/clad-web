import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getRaceAuditReport, setRaceAuditReport, type RaceAuditReport } from "~/lib/agents";
import { raceBoardSnapshot } from "~/lib/races";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** GET — current race board snapshot for the auditor + last stored audit. */
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const board = raceBoardSnapshot();
  const lastAudit = await getRaceAuditReport(env.AGENTS);
  return json({ board, lastAudit });
};

/** POST — store a race-board audit report from the runner. */
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
      sources: Array.isArray(f.sources) ? f.sources.map((s) => String(s).slice(0, 300)).slice(0, 6) : undefined,
    })),
  };
  await setRaceAuditReport(env.AGENTS, report);
  return json({ ok: true, findings: report.findings.length });
};
