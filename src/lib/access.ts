/**
 * Access tiers — registration wall (not a pay wall) while billing is paused.
 *
 *  - paid : active Stripe / Apple subscription (framework kept for future)
 *  - free : any signed-in account → full scoreboard access
 *  - anon : not signed in → grades locked until free account
 *
 * Flip BILLING_ENABLED to true when re-enabling Premium promos and paid-only
 * feature gates. Stripe/IAP code paths stay live either way.
 */
import { env } from "cloudflare:workers";
import { getSessionUser } from "./user-data.ts";

/**
 * When false:
 *  - Hide Premium / pricing / “Go Premium” promo surfaces
 *  - Every signed-in account gets full platform features (incl. reactions)
 *  - Anon still locked behind free registration
 * When true: restore supporter-tier upsells and paid-only extras.
 */
export const BILLING_ENABLED = false;

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
    // Fail closed: any auth/DB error degrades to anonymous access.
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

  const [sub, apple] = await Promise.all([
    env.DB.prepare("SELECT status, currentPeriodEnd FROM subscription WHERE userId = ?")
      .bind(user.id)
      .first<{ status: string; currentPeriodEnd: string | null }>(),
    env.DB.prepare("SELECT status, expiresAt FROM apple_subscription WHERE userId = ?")
      .bind(user.id)
      .first<{ status: string; expiresAt: string | null }>(),
  ]);

  const stripeActive =
    !!sub &&
    (sub.status === "active" || sub.status === "trialing") &&
    (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd).getTime() > now);

  const appleActive =
    !!apple &&
    apple.status === "active" &&
    !!apple.expiresAt &&
    new Date(apple.expiresAt).getTime() > now;

  if (stripeActive || appleActive) {
    return { tier: "paid", fullAccess: true, signedIn: true };
  }

  // Registration unlocks the full scoreboard. Payment is optional / future.
  return { tier: "free", fullAccess: true, signedIn: true };
}

/**
 * Features that used to require Premium (e.g. posting Reader Reactions).
 * While BILLING_ENABLED is false, any full-access (signed-in) user qualifies.
 */
export function hasPremiumFeatures(access: Access): boolean {
  if (!BILLING_ENABLED) return access.fullAccess;
  return access.tier === "paid";
}

/** Show pricing, /upgrade CTAs, manage-billing upsells, etc. */
export function showBillingPromo(): boolean {
  return BILLING_ENABLED;
}

/** Stripe is "configured" once its secret key is set. */
export function stripeConfigured(): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

// Display pricing (copy only — real amounts live on the Stripe Price).
// Kept for the upgrade page when BILLING_ENABLED is re-enabled.
export const PRICE = {
  monthly: "$2.99",
  annual: "$29.99",
  annualPerMonth: "$2.49",
} as const;
