import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getSessionUser, jsonResponse } from "~/lib/user-data";
import { stripeConfigured } from "~/lib/access";
import { createCheckoutSession, priceFor } from "~/lib/stripe";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);
  if (!stripeConfigured()) return jsonResponse({ error: "Payments are not configured yet." }, 503);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const plan = body.plan === "annual" ? "annual" : "monthly";
  const price = priceFor(plan);
  if (!price) return jsonResponse({ error: `No ${plan} price configured.` }, 503);

  const existing = await env.DB.prepare("SELECT stripeCustomerId FROM subscription WHERE userId = ?")
    .bind(user.id)
    .first<{ stripeCustomerId: string | null }>();

  try {
    const url = await createCheckoutSession({
      userId: user.id,
      email: user.email,
      price,
      customerId: existing?.stripeCustomerId ?? null,
      origin: new URL(request.url).origin,
    });
    return jsonResponse({ url });
  } catch (err: any) {
    return jsonResponse({ error: err?.message ?? "Could not start checkout." }, 502);
  }
};
