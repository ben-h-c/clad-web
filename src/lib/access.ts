/**
 * Subscription access tiers.
 *
 *  - paid  : an active (or Stripe-trialing) subscription → full access.
 *  - trial : within TRIAL_DAYS of account creation → full access.
 *  - free  : signed in, trial expired, no subscription → restricted
 *            (homepage only; grades + political lean hidden; can't flag posts).
 *  - anon  : not signed in → treated the same as free.
 *
 * "Full access" is the single gate the rest of the app checks.
 */
import { env } from "cloudflare:workers";
import { getSessionUser } from "./user-data";

export const TRIAL_DAYS = 7;

export type Tier = "paid" | "trial" | "free" | "anon";

export interface Access {
  tier: Tier;
  fullAccess: boolean;
  signedIn: boolean;
  trialEndsAt: number | null; // ms epoch, when known
}

const ANON: Access = { tier: "anon", fullAccess: false, signedIn: false, trialEndsAt: null };

export async function getAccess(headers: Headers): Promise<Access> {
  try {
    return await resolveAccess(headers);
  } catch (err) {
    // Fail closed: any auth/DB error (e.g. a misconfigured BETTER_AUTH_SECRET)
    // degrades to anonymous access instead of a 500 on every page.
    console.error("getAccess failed, degrading to anon:", err);
    return { ...ANON };
  }
}

async function resolveAccess(headers: Headers): Promise<Access> {
  const user = await getSessionUser(headers);
  if (!user) {
    return { ...ANON };
  }

  const now = Date.now();

  // Premium unlocks from EITHER rail: Stripe (web) or Apple IAP (iOS app).
  const sub = await env.DB.prepare(
    "SELECT status, currentPeriodEnd FROM subscription WHERE userId = ?"
  )
    .bind(user.id)
    .first<{ status: string; currentPeriodEnd: string | null }>();

  const stripeActive =
    !!sub &&
    (sub.status === "active" || sub.status === "trialing") &&
    (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd).getTime() > now);

  // Apple IAP entitlement: active subscription whose period hasn't lapsed.
  const apple = await env.DB.prepare(
    "SELECT status, expiresAt FROM apple_subscription WHERE userId = ?"
  )
    .bind(user.id)
    .first<{ status: string; expiresAt: string | null }>();
  const appleActive =
    !!apple &&
    apple.status === "active" &&
    !!apple.expiresAt &&
    new Date(apple.expiresAt).getTime() > now;

  if (stripeActive || appleActive) {
    return { tier: "paid", fullAccess: true, signedIn: true, trialEndsAt: null };
  }

  const created = user.createdAt ? new Date(user.createdAt).getTime() : now;
  const trialEndsAt = created + TRIAL_DAYS * 86_400_000;
  if (now < trialEndsAt) {
    return { tier: "trial", fullAccess: true, signedIn: true, trialEndsAt };
  }

  return { tier: "free", fullAccess: false, signedIn: true, trialEndsAt };
}

/** Stripe is "configured" once its secret key is set. Price IDs now live in
 *  code (see src/lib/stripe.ts), so they no longer gate this. */
export function stripeConfigured(): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

// Display pricing (copy only — the real amounts live on the Stripe Price).
export const PRICE = {
  monthly: "$2.99",
  annual: "$29.99",
  annualPerMonth: "$2.49",
} as const;

export function offerLine(signedIn: boolean): string {
  const base = `${PRICE.monthly}/mo or ${PRICE.annual}/yr (${PRICE.annualPerMonth}/mo)`;
  return signedIn ? base : `${base} · ${TRIAL_DAYS}-day free trial, no card required`;
}
