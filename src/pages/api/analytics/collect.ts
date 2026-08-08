/**
 * Public, cookieless analytics ingest.
 * Aggregate-only — see src/lib/analytics.ts for privacy rules.
 */
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ingestEvent, type CollectPayload } from "~/lib/analytics";

export const prerender = false;

const MAX_BODY = 2_048;

export const POST: APIRoute = async ({ request }) => {
  // Tiny responses so beacons stay cheap; always 204 on success-ish paths.
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) {
    return new Response(JSON.stringify({ error: "too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: CollectPayload;
  try {
    body = (await request.json()) as CollectPayload;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const result = await ingestEvent(env.DB, request, body);
  if (!result.ok) {
    return json({ error: result.error }, result.status);
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "https://cladfacts.com",
    },
  });
};

// CORS preflight for same-site is unnecessary; include for www/apex edge cases.
export const OPTIONS: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://cladfacts.com",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
