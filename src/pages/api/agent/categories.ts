import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getSearchCategories } from "~/lib/agents";

export const prerender = false;

// GET — the enabled search-category phrases for the scanner to search.
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const all = await getSearchCategories(env.AGENTS);
  const enabled = all.filter((c) => c.enabled).map((c) => c.label);
  return new Response(JSON.stringify({ categories: enabled }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
