import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import fs from "node:fs";
import path from "node:path";
import { generateOgImages } from "./scripts/genOgImages.mjs";

// Generate social-preview images before the build so they're picked up as
// static assets. Runs in Node (not the Worker), so it can use fs/satori/resvg.
// Also clears Astro's content cache at the start of each build: Cloudflare's
// build cache can persist a stale .astro content store, which otherwise bakes
// in deleted posts (phantom content) on the next deploy.
const ogImages = {
  name: "clad-og-images",
  hooks: {
    "astro:config:setup": () => {
      // The content data store lives in node_modules/.astro/data-store.json,
      // which Cloudflare's build cache persists — so deleted posts came back as
      // phantom entries. Clear both so content is always re-read from disk.
      for (const dir of [".astro", "node_modules/.astro"]) {
        try {
          fs.rmSync(path.join(process.cwd(), dir), { recursive: true, force: true });
        } catch {
          /* nothing to clear */
        }
      }
    },
    "astro:build:start": async () => {
      await generateOgImages();
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
  integrations: [ogImages],
  site: "https://cladfacts.com",
  trailingSlash: "ignore",
  build: {
    format: "directory",
  },
});
