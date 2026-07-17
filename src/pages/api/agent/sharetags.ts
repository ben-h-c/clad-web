import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getShareTags, setShareTags } from "~/lib/agents";
import { getCommunityVotes } from "~/lib/picks";
import { DEFAULT_ELECTION_ID, getElection } from "~/lib/elections";

export const prerender = false;

/**
 * Share taglines for static surfaces (ShareBar hooks). The share-tag-writer
 * agent GETs the current pool plus live context (anonymous aggregates only —
 * ballot counts and race tallies are non-gated by design), writes fresh
 * taglines via Grok, and POSTs them back; pages read the pool from KV.
 */
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const data = await getShareTags(env.AGENTS);

  // Live context for the writer. Best-effort: a failed lookup degrades to
  // static intent lines in the prompt, never a failed run.
  let votes: {
    lockedBallots: number;
    totalPicks: number;
    topRace: { office: string; aName: string; bName: string; aPct: number; bPct: number } | null;
  } | null = null;
  try {
    const summary = await getCommunityVotes(DEFAULT_ELECTION_ID);
    if (summary) {
      const withVotes = summary.races.filter((r) => r.total > 0);
      const top = [...withVotes].sort((a, b) => b.total - a.total)[0] ?? null;
      votes = {
        lockedBallots: summary.lockedBallots,
        totalPicks: summary.totalPicks,
        topRace: top
          ? { office: top.office, aName: top.aName, bName: top.bName, aPct: top.aPct, bPct: top.bPct }
          : null,
      };
    }
  } catch {
    /* context is optional */
  }

  const election = getElection(DEFAULT_ELECTION_ID);
  const context = {
    votes,
    bracket: election ? { raceCount: election.races.length } : null,
    todayET: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()),
  };

  return json({ ok: true, data, context }, 200);
};

export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!payload?.tags || typeof payload.tags !== "object" || Array.isArray(payload.tags)) {
    return json({ error: "tags object required" }, 400);
  }
  const data = await setShareTags(env.AGENTS, payload.tags);
  return json({ ok: true, tags: data.tags }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
