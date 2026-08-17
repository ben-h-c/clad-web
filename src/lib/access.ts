/**
 * Access tiers — registration wall (not a pay wall) while billing is paused.
 *
 *  - paid : active Stripe / Apple subscription (framework kept for future)
 *  - free : signed-in, email-verified account → full scoreboard access
 *  - anon : not signed in (or unverified email/password) → grades locked
 *
 * Flip BILLING_ENABLED to true when re-enabling Premium promos and paid-only
 * feature gates. Stripe/IAP code paths stay live either way.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "cloudflare:workers";
import { getSessionUser, type SessionUser } from "./user-data.ts";

/** Staging-only preview: force signed-in (grades on) or guest (grades locked). */
export type StageView = "signed" | "anon";
export const STAGE_VIEW_COOKIE = "clad_stage_view";
export const STAGE_SKIN_COOKIE = "clad_stage_skin";
/** Staging layout experiments — never applied in production. Cover only. */
export const STAGE_SKINS = ["cover"] as const;
export type StageSkin = (typeof STAGE_SKINS)[number];

const stageAls = new AsyncLocalStorage<StageView | null>();

export function runWithStageView<T>(view: StageView | null, fn: () => T): T {
  return stageAls.run(view, fn);
}

export function getStageView(): StageView | null {
  if (env.ENVIRONMENT !== "staging") return null;
  return stageAls.getStore() ?? null;
}

export function parseStageView(raw: string | null | undefined): StageView | null {
  return raw === "signed" || raw === "anon" ? raw : null;
}

export function parseStageSkin(raw: string | null | undefined): StageSkin | null {
  if (!raw || raw === "off" || raw === "current") return null;
  return (STAGE_SKINS as readonly string[]).includes(raw) ? (raw as StageSkin) : null;
}

export const STAGING_PREVIEW_USER: SessionUser = {
  id: "staging-preview",
  name: "Preview (signed-in)",
  email: "preview@staging.local",
  emailVerified: true,
  createdAt: null,
};

/**
 * When false:
 *  - Hide Premium / pricing / “Go Premium” promo surfaces
 *  - Every verified signed-in account gets full platform features (incl. reactions)
 *  - Anon still locked behind free registration
 * When true: restore supporter-tier upsells and paid-only extras.
 */
export const BILLING_ENABLED = false;

export type Tier = "paid" | "free" | "anon";

export interface Access {
  tier: Tier;
  fullAccess: boolean;
  signedIn: boolean;
  /** Resolved session user when signed in (avoids a second getSession). */
  user?: import("./user-data.ts").SessionUser | null;
}

const ANON: Access = { tier: "anon", fullAccess: false, signedIn: false, user: null };

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
  const preview = getStageView();
  if (preview === "anon") {
    return { ...ANON };
  }

  const user = await getSessionUser(headers);
  if (preview === "signed") {
    if (user) {
      return { tier: "free", fullAccess: true, signedIn: true, user };
    }
    return { tier: "free", fullAccess: true, signedIn: true, user: STAGING_PREVIEW_USER };
  }

  if (!user) {
    return { ...ANON };
  }

  // When verification email can be sent (RESEND configured), require
  // emailVerified for full access. Social logins are auto-verified.
  // When RESEND is unset, Better Auth cannot verify — do not lock everyone out.
  if (env.RESEND_API_KEY && !user.emailVerified) {
    return { tier: "anon", fullAccess: false, signedIn: true, user };
  }

  // Billing off: skip dead subscription table reads (C1). Every verified
  // signed-in user has full access; paid tier is indistinguishable in UI.
  if (!BILLING_ENABLED) {
    return { tier: "free", fullAccess: true, signedIn: true, user };
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
    return { tier: "paid", fullAccess: true, signedIn: true, user };
  }

  // Registration unlocks the full scoreboard. Payment is optional / future.
  return { tier: "free", fullAccess: true, signedIn: true, user };
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
