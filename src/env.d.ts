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
    APPLE_CLIENT_ID?: string;
    APPLE_CLIENT_SECRET?: string;
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
  }
}
