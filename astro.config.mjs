import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// Server-rendered for the /admin and /api routes, with everything else
// pre-rendered at build time. The Cloudflare adapter splits the bundle so
// public pages are served from the edge cache and only protected routes
// touch a Worker.
export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  site: "https://clad.app",
  trailingSlash: "ignore",
  build: {
    format: "directory",
  },
});
