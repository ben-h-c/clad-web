import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import {
  getElectionForecastLive,
  mergeElectionForecastLive,
  setElectionForecastLive,
} from "~/lib/agents";
import { normalizeForecastLive } from "~/lib/electionForecast";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** GET — live forecast overlay (asOf + rating patches). */
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const store = await getElectionForecastLive(env.AGENTS);
  return json({ store });
};

/**
 * POST — replace/merge live forecast.
 * Body: { asOf, reason?, senate?, governor?, house?, control?, replace?: boolean }
 * Default merges patches onto previous store; replace:true overwrites layers fully.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const incoming = normalizeForecastLive({
    ...o,
    generatedAt: o.generatedAt || new Date().toISOString(),
  });
  if (!incoming) {
    return json({ error: "invalid forecast (need asOf YYYY-MM-DD)" }, 400);
  }

  const prev = await getElectionForecastLive(env.AGENTS);
  const replace = o.replace === true;
  const store = replace
    ? incoming
    : mergeElectionForecastLive(prev, incoming);

  await setElectionForecastLive(env.AGENTS, store);
  return json({ ok: true, store });
};
