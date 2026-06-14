import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getTrendingTopics, setTrendingTopics } from "~/lib/agents";

export const prerender = false;

// GET — current trending topics (for the scanner to read).
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const trending = (await getTrendingTopics(env.AGENTS)) ?? { updatedAt: "", topics: [] };
  return json(trending, 200);
};

// POST — store the trending-topics agent's latest list.
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
  const topics = Array.isArray(p?.topics) ? p.topics : [];
  await setTrendingTopics(env.AGENTS, topics);
  return json({ ok: true, count: Math.min(topics.length, 30) }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
