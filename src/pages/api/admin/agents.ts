import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getRegistry, patchAgent } from "~/lib/agents";

export const prerender = false;

export const GET: APIRoute = async () => {
  const registry = await getRegistry(env.AGENTS);
  return json(registry, 200);
};

export const POST: APIRoute = async ({ request }) => {
  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const agentId = String(p?.agentId ?? "").trim();
  if (!agentId) return json({ error: "agentId required" }, 400);

  const patch: { enabled?: boolean; cron?: string } = {};
  if (typeof p.enabled === "boolean") patch.enabled = p.enabled;
  if (typeof p.cron === "string") {
    const cron = p.cron.trim();
    if (!isValidCron(cron)) return json({ error: "Cron must have 5 fields (e.g. '0 */6 * * *')" }, 400);
    patch.cron = cron;
  }

  const agent = await patchAgent(env.AGENTS, agentId, patch);
  if (!agent) return json({ error: "Agent not found" }, 404);
  return json({ ok: true, agent }, 200);
};

// Light validation: a standard 5-field cron. The runner's cron-parser does the
// real interpretation; this just catches obvious typos in the console.
function isValidCron(s: string): boolean {
  const parts = s.split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every((f) => /^[\d*\/,\-]+$/.test(f));
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
