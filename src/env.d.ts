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
  }
}
