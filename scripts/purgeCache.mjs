/**
 * Post-deploy Cloudflare cache purge. Chained after `wrangler deploy` so a
 * fresh Worker never serves stale edge-cached assets (mainly the on-demand
 * OG images at og/[slug].png, which carry a 7-day s-maxage, plus any
 * dashboard Cache Rules).
 *
 * Needs CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN in the environment.
 * The token only needs Zone → Cache Purge on the cladfacts.com zone —
 * do NOT reuse the account deploy token.
 *
 * Run:  node scripts/purgeCache.mjs [--soft]
 *
 * With --soft (or PURGE_OPTIONAL=1) missing credentials skip the purge and
 * exit 0 instead of failing — use that in Workers Builds so a deploy never
 * breaks on a missing variable; laptop deploys fail loudly.
 */
const zoneId = process.env.CLOUDFLARE_ZONE_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const soft = process.argv.includes("--soft") || process.env.PURGE_OPTIONAL === "1";

if (!zoneId || !token) {
  const msg = "purge skipped: CLOUDFLARE_ZONE_ID / CLOUDFLARE_API_TOKEN not set";
  if (soft) {
    console.log(msg);
    process.exit(0);
  }
  console.error(msg);
  process.exit(1);
}

try {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ purge_everything: true }),
  });
  const result = await res.json().catch(() => null);
  if (res.ok && result?.success === true) {
    console.log(`Cloudflare cache purged (zone …${zoneId.slice(-4)})`);
    process.exit(0);
  }
  console.error(`purge failed: HTTP ${res.status}`, JSON.stringify(result?.errors ?? result));
  process.exit(1);
} catch (err) {
  console.error("purge failed:", err?.message ?? err);
  process.exit(1);
}
