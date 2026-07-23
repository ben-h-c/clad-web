import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getHomeLayout, setHomeLayout } from "~/lib/agents";
import {
  normalizeHomeLayout,
  type HomeLayoutStore,
} from "~/lib/homeLayout";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** GET — current dynamic home layout (for the agent / debug). */
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const store = await getHomeLayout(env.AGENTS);
  return json({ store });
};

/**
 * POST — replace the home layout plan.
 * Body: HomeLayoutStore fields (generatedAt, expiresAt, reason, order?, hide?, highlight?)
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

  const normalized = normalizeHomeLayout(body);
  if (!normalized) {
    return json(
      { error: "invalid layout (need generatedAt, expiresAt, reason)" },
      400
    );
  }

  // Cap TTL at 36h even if agent asks for longer (stale layouts fade out).
  const maxExp = Date.now() + 36 * 3600_000;
  const expMs = Date.parse(normalized.expiresAt);
  if (!Number.isNaN(expMs) && expMs > maxExp) {
    normalized.expiresAt = new Date(maxExp).toISOString();
  }

  const payload: HomeLayoutStore = {
    ...normalized,
    generatedAt: normalized.generatedAt || new Date().toISOString(),
  };

  await setHomeLayout(env.AGENTS, payload);
  return json({ ok: true, store: payload });
};
