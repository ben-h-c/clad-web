import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getQuips, setQuips } from "~/lib/agents";

export const prerender = false;

// The quip-writer posts the refreshed pool of fun one-liners; the home page
// reads them from KV for the for-fun ticker.
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const data = await getQuips(env.AGENTS);
  return json({ ok: true, data }, 200);
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
  const quips: string[] = Array.isArray(payload?.quips)
    ? payload.quips.map((q: unknown) => String(q ?? "").trim()).filter(Boolean).slice(0, 300)
    : [];
  await setQuips(env.AGENTS, quips);
  return json({ ok: true, count: quips.length }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
