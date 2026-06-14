import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getRegistry, getRunNow } from "~/lib/agents";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const registry = await getRegistry(env.AGENTS);
  // Attach any pending manual "run now" request per agent.
  const agents = await Promise.all(
    registry.agents.map(async (a) => ({ ...a, runNowAt: await getRunNow(env.AGENTS, a.id) }))
  );
  return json({ ...registry, agents }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
