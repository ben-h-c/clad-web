import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { setBreaking } from "~/lib/agents";

export const prerender = false;

// The breaking-news curator posts the ordered list of post ids to feature in
// the Breaking News strip.
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
  const ids: string[] = Array.isArray(payload?.ids)
    ? payload.ids.map((v: unknown) => String(v)).filter(Boolean)
    : [];
  await setBreaking(env.AGENTS, ids);
  return json({ ok: true, count: ids.length }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
