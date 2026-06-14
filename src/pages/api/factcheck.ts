import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { factCheck } from "~/lib/grok";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!env.XAI_API_KEY) return json({ error: "XAI_API_KEY not configured" }, 503);

  // Single shared key — one editor, one bucket. The basic-auth gate already
  // limits who can hit this; the rate limit is a backstop for a leaked
  // credential and stops the xAI bill from running away.
  if (env.FACTCHECK_LIMITER) {
    const { success } = await env.FACTCHECK_LIMITER.limit({ key: "factcheck" });
    if (!success) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again in a minute." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
          },
        }
      );
    }
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const headline = String(payload?.headline ?? "").trim();
  const sourceUrl = payload?.sourceUrl ? String(payload.sourceUrl).trim() : undefined;
  const notes = payload?.notes ? String(payload.notes).trim() : undefined;

  if (headline.length < 4) return json({ error: "Headline too short" }, 400);
  if (headline.length > 400) return json({ error: "Headline too long" }, 400);
  if (sourceUrl && !isHttpUrl(sourceUrl)) return json({ error: "Source URL must be http(s)" }, 400);

  try {
    const result = await factCheck(env.XAI_API_KEY, { headline, sourceUrl, notes });
    return json(result, 200);
  } catch (err: any) {
    return json({ error: err?.message ?? "Fact-check failed" }, 502);
  }
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
