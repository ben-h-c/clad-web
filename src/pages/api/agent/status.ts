import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { setLastRun, type AgentLastRun } from "~/lib/agents";

export const prerender = false;

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

  const agentId = String(payload?.agentId ?? "").trim();
  if (!agentId) return json({ error: "agentId required" }, 400);

  const lastRun: AgentLastRun = {
    at: new Date().toISOString(),
    ok: Boolean(payload?.ok),
    message: String(payload?.message ?? "").slice(0, 500),
    submitted: Number(payload?.submitted ?? 0) || 0,
    skipped: Number(payload?.skipped ?? 0) || 0,
    durationMs: Number(payload?.durationMs ?? 0) || 0,
  };

  await setLastRun(env.AGENTS, agentId, lastRun);
  return json({ ok: true }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
