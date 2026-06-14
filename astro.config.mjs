import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import { generateOgImages } from "./scripts/genOgImages.mjs";

// Generate social-preview images before the build so they're picked up as
// static assets. Runs in Node (not the Worker), so it can use fs/satori/resvg.
const ogImages = {
  name: "clad-og-images",
  hooks: {
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
