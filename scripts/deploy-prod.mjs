#!/usr/bin/env node
/**
 * Production deploy. Agents must not run this unless Ben said
 * "push to prod" / "deploy production" after reviewing staging.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

if (process.env.CONFIRM_PROD !== "1") {
  console.error("Blocked: production deploy requires explicit approval.");
  console.error("  1. Ship + test on staging:  npm run deploy:staging");
  console.error("  2. After Ben says push to prod:  CONFIRM_PROD=1 npm run deploy");
  process.exit(2);
}

function run(cmd, args, { allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, shell: false });
  if (r.status !== 0 && !allowFail) process.exit(r.status ?? 1);
  return r.status ?? 1;
}

console.log("→ production deploy (cladfacts.com)");
run("npx", ["astro", "build"]);
run("npx", ["wrangler", "deploy"]);
// Purge is best-effort. The Worker is already live after wrangler deploy.
// Missing CLOUDFLARE_ZONE_ID / TOKEN used to fail the whole ship and made
// Clad Studio "Push to production" loop on a false error.
const purge = run("node", ["scripts/purgeCache.mjs"], { allowFail: true });
if (purge !== 0) {
  console.warn(
    "Cache purge did not run — Worker is already live. Set CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN (Zone → Cache Purge) to clear the edge cache."
  );
}
run("node", ["scripts/smoke-anon.mjs"]);
