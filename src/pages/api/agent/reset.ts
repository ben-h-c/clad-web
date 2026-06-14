import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { clearDrafts, clearSeen, clearFrontpage } from "~/lib/agents";

export const prerender = false;

// Token-authed maintenance: wipe agent KV state for a clean start.
// Body: { drafts?: bool, seen?: bool, frontpage?: bool }
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  let p: any;
  try {
    p = await request.json();
  } catch {
    p = {};
  }

  const result: Record<string, unknown> = {};
  if (p?.drafts) result.draftsCleared = await clearDrafts(env.AGENTS);
  if (p?.seen) result.seenCleared = await clearSeen(env.AGENTS);
  if (p?.frontpage) {
    await clearFrontpage(env.AGENTS);
    result.frontpageCleared = true;
  }

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
