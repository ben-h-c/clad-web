import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getSessionUser, jsonResponse } from "~/lib/user-data";
import { stripeConfigured } from "~/lib/access";
import { createPortalSession } from "~/lib/stripe";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);
  if (!stripeConfigured()) return jsonResponse({ error: "Payments are not configured yet." }, 503);

  const row = await env.DB.prepare("SELECT stripeCustomerId FROM subscription WHERE userId = ?")
    .bind(user.id)
    .first<{ stripeCustomerId: string | null }>();
  if (!row?.stripeCustomerId) return jsonResponse({ error: "No billing account found." }, 404);

  try {
    const url = await createPortalSession(row.stripeCustomerId, new URL(request.url).origin);
    return jsonResponse({ url });
  } catch (err: any) {
    return jsonResponse({ error: err?.message ?? "Could not open billing portal." }, 502);
  }
};
