/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

// Bindings exposed via `import { env } from "cloudflare:workers"` (Astro 6+).
declare module "cloudflare:workers" {
  interface Env {
    XAI_API_KEY: string;
    ADMIN_USER: string;
    ADMIN_PASSWORD: string;
    GITHUB_TOKEN: string;
    GITHUB_REPO: string;
    GITHUB_BRANCH: string;
    FACTCHECK_LIMITER: RateLimitBinding;
    AGENT_TOKEN: string;
    AGENTS: KVNamespace;
    // User accounts (Better Auth on D1)
    DB: D1Database;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL?: string;
    // Social providers (gated — present only once configured)
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    // iOS native Google Sign-In mints id tokens with the iOS OAuth client ID
    // as their audience; adding it lets the native sign-in verify server-side
    // while the web flow keeps using GOOGLE_CLIENT_ID (the array's index 0).
    GOOGLE_IOS_CLIENT_ID?: string;
    APPLE_CLIENT_ID?: string;
    APPLE_CLIENT_SECRET?: string;
    // Native Sign in with Apple id tokens carry the app bundle id as audience
    // (vs the web Services ID); set this so native apple sign-in verifies.
    APPLE_APP_BUNDLE_ID?: string;
    TWITTER_CLIENT_ID?: string;
    TWITTER_CLIENT_SECRET?: string;
    // Transactional email
    RESEND_API_KEY?: string;
    // Stripe (paid tier) — gated: the subscription flow is inert until set
    STRIPE_SECRET_KEY?: string;
    STRIPE_PRICE_MONTHLY?: string;
    STRIPE_PRICE_ANNUAL?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
    // APNs push (iOS app). APNS_KEY is the full .p8 contents (the only real
    // secret) and gates push. APNS_KEY_ID / APNS_TEAM_ID are hard-coded in
    // lib/push.ts (public identifiers) — these env vars are optional overrides.
    APNS_KEY?: string;
    APNS_KEY_ID?: string;
    APNS_TEAM_ID?: string;
    // Apple In-App Purchase — App Store Server API key (verifies app
    // subscriptions). APPLE_IAP_KEY is the full .p8 contents (the secret).
    APPLE_IAP_KEY?: string;
    APPLE_IAP_KEY_ID?: string;
    APPLE_IAP_ISSUER_ID?: string;
    // Defaults to com.bencody.cladfacts if unset.
    APNS_BUNDLE_ID?: string;
  }
}
