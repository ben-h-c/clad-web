import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { apnsConfigured, sendPush } from "~/lib/push";

export const prerender = false;

/**
 * Admin tools for push (basic-auth via middleware):
 *  GET  — status (configured, token counts by env)
 *  POST — send a test alert { title?, body?, path?, kind? }
 */
export const GET: APIRoute = async () => {
  const configured = await apnsConfigured();
  const rows = await env.DB.prepare(
    "SELECT environment, COUNT(*) AS c, COUNT(userId) AS withUser FROM push_token GROUP BY environment"
  ).all<{ environment: string; c: number; withUser: number }>();
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_token").first<{ n: number }>();

  return json({
    configured,
    total: total?.n ?? 0,
    byEnvironment: rows.results ?? [],
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!(await apnsConfigured())) {
    return json({ error: "APNs not configured (set secret:APNS_KEY in AGENTS KV)" }, 503);
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    path?: string;
    kind?: string;
  };

  const title = (body.title || "CladFacts").slice(0, 80);
  const text = (body.body || "Test notification — push is working.").slice(0, 180);
  const pathRaw = typeof body.path === "string" && body.path.trim() ? body.path.trim() : "/";
  const path = pathRaw.startsWith("/") ? pathRaw : `/${pathRaw}`;
  const kind = body.kind === "event" || body.kind === "report" ? body.kind : "test";

  const result = await sendPush({
    title,
    body: text,
    path,
    kind,
  });

  return json({ ok: true, result });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
