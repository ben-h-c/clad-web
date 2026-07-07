import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getSentiments, mergeSentiments, SENTIMENT_VOLUMES, type SentimentMap, type SocialSentiment } from "~/lib/agents";

export const prerender = false;

// Social-media sentiment cache, written by the social-sentiment scanner. GET
// returns the full map; POST merges new entries and (optionally) prunes any
// post ids not in `keepIds`.
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const map = await getSentiments(env.AGENTS);
  return json({ ok: true, sentiments: map }, 200);
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
  const raw = payload?.updates && typeof payload.updates === "object" ? payload.updates : {};
  // Re-validate scanner input at the trust boundary: clamp the score and drop
  // anything that isn't a well-formed entry so bad data can't reach the UI.
  const updates: SentimentMap = {};
  for (const [id, v] of Object.entries<any>(raw)) {
    const score = Number(v?.score);
    if (!Number.isFinite(score)) continue;
    updates[String(id)] = {
      score: Math.max(-100, Math.min(100, Math.round(score))),
      summary: String(v?.summary ?? "").trim().slice(0, 500),
      volume: (SENTIMENT_VOLUMES as readonly string[]).includes(v?.volume)
        ? (v.volume as SocialSentiment["volume"])
        : "low",
      platforms: Array.isArray(v?.platforms)
        ? v.platforms.map((p: unknown) => String(p ?? "").trim()).filter(Boolean).slice(0, 6)
        : [],
      at: typeof v?.at === "string" && v.at ? v.at : new Date().toISOString(),
    };
  }
  const keepIds: string[] = Array.isArray(payload?.keepIds)
    ? payload.keepIds.map((v: unknown) => String(v))
    : [];
  const merged = await mergeSentiments(env.AGENTS, updates, keepIds);
  return json({ ok: true, count: Object.keys(merged).length }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
