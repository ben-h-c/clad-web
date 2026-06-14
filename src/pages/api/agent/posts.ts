import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { publishedPostsMeta } from "~/lib/agents";

export const prerender = false;

// Published-post metadata for the front-page curator to score.
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const posts = await publishedPostsMeta();
  return new Response(JSON.stringify({ posts }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
