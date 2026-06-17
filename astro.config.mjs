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
  trailingSlash: "ignore",
  // Some clients (incl. Search Console) request the sitemap with a trailing
  // slash; the endpoint lives at /sitemap.xml, so redirect the slashed form.
  redirects: {
    "/sitemap.xml/": "/sitemap.xml",
  },
  build: {
    format: "directory",
  },
});
