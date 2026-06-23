/**
 * Minimal Stripe helpers over fetch (no SDK — keeps the Worker bundle small).
 * Covers the subscription flow: create Checkout Session, billing-portal link,
 * webhook signature verification, and writing subscription state to D1.
 */
import { env } from "cloudflare:workers";

const API = "https://api.stripe.com/v1";

function form(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null) u.append(k, v);
  return u.toString();
}

async function stripe(path: string, body: string): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error?.message || `Stripe ${res.status}`);
  return data;
}

// Stripe Price IDs are the source of truth in code (they are not secrets —
// just identifiers). They're hard-coded so a price change deploys with the
// code via git→CI, deterministically; the older STRIPE_PRICE_* Worker env
// vars are stale (they point at the previous prices) and are intentionally
// NOT read here. An explicit env override is still honored if ever set anew.
const PRICE_IDS = {
  monthly: "price_1TjL8hByYhIV2aMNT74BMEHO",
  annual: "price_1TjL8sByYhIV2aMNueLeuMDP",
} as const;

export function priceFor(plan: string): string {
  return plan === "annual" ? PRICE_IDS.annual : PRICE_IDS.monthly;
}

export async function createCheckoutSession(opts: {
  userId: string;
  email: string;
  price: string;
  customerId?: string | null;
  origin: string;
}): Promise<string> {
  const data = await stripe(
    "/checkout/sessions",
    form({
      mode: "subscription",
      "line_items[0][price]": opts.price,
      "line_items[0][quantity]": "1",
      client_reference_id: opts.userId,
      customer: opts.customerId || undefined,
      customer_email: opts.customerId ? undefined : opts.email,
      "metadata[userId]": opts.userId,
      "subscription_data[metadata][userId]": opts.userId,
      allow_promotion_codes: "true",
      success_url: `${opts.origin}/account/?upgraded=1`,
      cancel_url: `${opts.origin}/upgrade/?canceled=1`,
    })
  );
  return data.url as string;
}

export async function createPortalSession(customerId: string, origin: string): Promise<string> {
  const data = await stripe(
    "/billing_portal/sessions",
    form({ customer: customerId, return_url: `${origin}/account/` })
  );
  return data.url as string;
}

/**
 * Cancel a Stripe subscription immediately. Best-effort: used when a user
 * deletes their account, so we stop future charges before removing their rows.
 * A 404 (already gone) is treated as success. No-op if Stripe isn't configured
 * or there's no subscription id (e.g. the user is on an Apple IAP or comp plan).
 */
export async function cancelSubscription(subscriptionId: string | null | undefined): Promise<void> {
  if (!env.STRIPE_SECRET_KEY || !subscriptionId) return;
  const res = await fetch(`${API}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any)?.error?.message || `Stripe cancel ${res.status}`);
  }
}

// --- D1 subscription state -------------------------------------------------
export async function upsertSubscription(row: {
  userId: string;
  status: string;
  plan?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: string | null;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO subscription (userId, status, plan, stripeCustomerId, stripeSubscriptionId, currentPeriodEnd, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(userId) DO UPDATE SET
       status = excluded.status,
       plan = COALESCE(excluded.plan, subscription.plan),
       stripeCustomerId = COALESCE(excluded.stripeCustomerId, subscription.stripeCustomerId),
       stripeSubscriptionId = COALESCE(excluded.stripeSubscriptionId, subscription.stripeSubscriptionId),
       currentPeriodEnd = excluded.currentPeriodEnd,
       updatedAt = excluded.updatedAt`
  )
    .bind(
      row.userId,
      row.status,
      row.plan ?? null,
      row.stripeCustomerId ?? null,
      row.stripeSubscriptionId ?? null,
      row.currentPeriodEnd ?? null,
      new Date().toISOString()
    )
    .run();
}

export async function userIdForCustomer(customerId: string): Promise<string | null> {
  const r = await env.DB.prepare("SELECT userId FROM subscription WHERE stripeCustomerId = ?")
    .bind(customerId)
    .first<{ userId: string }>();
  return r?.userId ?? null;
}

// --- Webhook signature verification (Web Crypto, Workers-safe) --------------
export async function verifyWebhook(payload: string, sigHeader: string | null): Promise<boolean> {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, v];
    })
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time-ish compare
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
