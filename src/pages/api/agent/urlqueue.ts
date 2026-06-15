import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getUrlQueue, dequeueUrls, markSeen } from "~/lib/agents";
import { extractVideoId } from "~/lib/youtube";

export const prerender = false;

// GET — the runner reads queued URLs to process.
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  return json({ urls: await getUrlQueue(env.AGENTS) }, 200);
};

// POST { remove: [...] } — the runner removes URLs it has processed.
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
  const remove = Array.isArray(p?.remove) ? p.remove : [];
  // Mark every processed URL's video as seen — whatever the outcome (drafted,
  // duplicate, or skipped for no transcript) — so re-submitting it is ignored.
  for (const u of remove) {
    const vid = extractVideoId(String(u));
    if (vid) await markSeen(env.AGENTS, vid);
  }
  const list = await dequeueUrls(env.AGENTS, remove);
  return json({ ok: true, remaining: list.length }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
