import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getTicker, setTicker, type TickerQuote } from "~/lib/agents";

export const prerender = false;

// The runner posts fresh market quotes here; the home page reads them from KV.
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const data = await getTicker(env.AGENTS);
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
  const quotes: TickerQuote[] = Array.isArray(payload?.quotes)
    ? payload.quotes
        .map((q: any) => ({
          label: String(q?.label ?? "").trim(),
          price: Number(q?.price),
          changePct: Number(q?.changePct),
        }))
        .filter((q: TickerQuote) => q.label && Number.isFinite(q.price) && Number.isFinite(q.changePct))
        .slice(0, 40)
    : [];
  await setTicker(env.AGENTS, quotes);
  return json({ ok: true, count: quotes.length }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
