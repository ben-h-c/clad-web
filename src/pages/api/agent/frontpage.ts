import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getFrontpage, setFrontpage } from "~/lib/agents";

export const prerender = false;

// Read current front-page ids (curator keep-prior when talk-show pool is empty).
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const ids = await getFrontpage(env.AGENTS);
  return json({ ok: true, ids }, 200);
};

// The curator posts the ordered list of post ids to feature on the home page.
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
  await setFrontpage(env.AGENTS, ids);
  return json({ ok: true, count: ids.length }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
