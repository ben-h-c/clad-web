import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getClassifications, mergeClassifications, type ClassificationMap } from "~/lib/agents";

export const prerender = false;

// Shared newsroom classification cache. GET returns the full map; POST merges
// new entries and (optionally) prunes any post ids not in `keepIds`.
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const map = await getClassifications(env.AGENTS);
  return json({ ok: true, classifications: map }, 200);
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
  const updates: ClassificationMap =
    payload?.updates && typeof payload.updates === "object" ? payload.updates : {};
  const keepIds: string[] = Array.isArray(payload?.keepIds)
    ? payload.keepIds.map((v: unknown) => String(v))
    : [];
  const merged = await mergeClassifications(env.AGENTS, updates, keepIds);
  return json({ ok: true, count: Object.keys(merged).length }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
