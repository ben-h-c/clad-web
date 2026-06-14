import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { patchAgent } from "~/lib/agents";

export const prerender = false;

// Token-authed agent config update (cron / enabled / tuning params). Lets the
// operator retune an agent without the basic-auth console.
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const agentId = String(p?.agentId ?? "").trim();
  if (!agentId) return json({ error: "agentId required" }, 400);

  const patch: any = {};
  if (typeof p.enabled === "boolean") patch.enabled = p.enabled;
  if (typeof p.cron === "string") patch.cron = p.cron.trim();
  if (p.config && typeof p.config === "object") patch.config = p.config;

  const agent = await patchAgent(env.AGENTS, agentId, patch);
  if (!agent) return json({ error: "Agent not found" }, 404);
  return json({ ok: true, agent }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
