import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import fs from "node:fs";
import path from "node:path";

// Clear Astro's content cache at the start of each build: Cloudflare's build
// cache can persist a stale .astro content store, which otherwise bakes in
// deleted posts (phantom content) on the next deploy. (Social-preview images
// are now rendered on demand at the edge by src/pages/og/[slug].png.ts, so
// there's no build-time image generation here anymore.)
const clearContentCache = {
  name: "clad-clear-content-cache",
  hooks: {
    "astro:config:setup": () => {
      for (const dir of [".astro", "node_modules/.astro"]) {
        try {
          fs.rmSync(path.join(process.cwd(), dir), { recursive: true, force: true });
        } catch {
          /* nothing to clear */
        }
      }
    },
  },
};

// Server-rendered for the /admin and /api routes, with everything else
// pre-rendered at build time. The Cloudflare adapter splits the bundle so
// public pages are served from the edge cache and only protected routes
// touch a Worker.
export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  integrations: [clearContentCache],
  site: "https://cladfacts.com",
  // MUST stay "ignore". With "always", Astro itself 301/308-redirects
  // extensionless API routes (/api/auth/sign-in/email → …/email/) before
  // middleware can exempt them, and Better Auth's internal router 404s the
  // slash form — which broke every sign-in (web + iOS) and Stripe webhook
  // delivery. The canonical trailing-slash policy for HTML pages is enforced
  // by the middleware 301 normalizer (src/middleware.ts), which skips /api/*.
  trailingSlash: "ignore",
  build: {
    format: "directory",
  },
});
