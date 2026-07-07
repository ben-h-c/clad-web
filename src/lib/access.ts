/**
 * Access tiers — the growth-phase "hybrid" model (owner decision 2026-07-07):
 * a registration wall, not a pay wall.
 *
 *  - paid : an active (or Stripe-trialing) subscription → full access, plus
 *           Premium extras (posting Reader Reactions). The supporter tier.
 *  - free : any signed-in account → FULL ACCESS to every grade, factuality
 *           score, political-lean rating, sentiment score, chart, and search
 *           filter. No trial clock, no card.
 *  - anon : not signed in → article text is free; the scoreboard is teased
 *           (plus the daily data-sample-unlocked sample). Creating a free
 *           account is the unlock.
 *
 * "Full access" is the single gate the rest of the app checks. If/when the
 * model is re-metered, this file is the choke point — see
 * docs/daily-review.md ("Constraints") before changing it.
 */
import { env } from "cloudflare:workers";
import { getSessionUser } from "./user-data";

export type Tier = "paid" | "free" | "anon";

export interface Access {
  tier: Tier;
  fullAccess: boolean;
  signedIn: boolean;
}

const ANON: Access = { tier: "anon", fullAccess: false, signedIn: false };

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
    return { tier: "paid", fullAccess: true, signedIn: true };
  }

  // Every account gets the full scoreboard — the wall is registration, not
  // payment. Premium remains the supporter tier (reactions posting + keeping
  // the newsroom running).
  return { tier: "free", fullAccess: true, signedIn: true };
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
