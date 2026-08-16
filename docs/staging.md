# Staging (non-prod)

Isolated Cloudflare Worker for redesigns and QA. **Does not bind cladfacts.com.**

| | Staging | Production |
|--|---------|------------|
| URL | https://clad-web-staging.benjaminharriscody.workers.dev (`staging.cladfacts.com` when DNS is live) | https://cladfacts.com |
| Worker | `clad-web-staging` | `clad-web` |
| KV | `AGENTS_STAGING` | `AGENTS` (live) |
| D1 | `clad-users-staging` | `clad-users` |
| Secrets | `--env staging` | default |

## Deploy (does not touch prod)

```bash
cd ~/clad-web
npm run deploy:staging
```

Do **not** run `npx wrangler deploy --env staging` after `astro build`. The Astro adapter writes `dist/server/wrangler.json` without `env.staging`, so that command deploys **production**. Always use `scripts/deploy-staging.mjs`.

## Seed / secrets (one-time or after schema changes)

```bash
# D1 schema
for f in db/*.sql; do
  npx wrangler d1 execute clad-users-staging --env staging --remote --file "$f"
done

# Secrets (from local .dev.vars — never commit that file)
# npx wrangler secret put NAME --env staging
```

Copy home/agent KV from prod when you want staging to look like live:

- **In the browser:** staging bar → **Refresh from production** (admin basic-auth). Copies home packs, agent registry, politicians, ticker, calendar, etc. Does **not** copy drafts, flags, seen-ledger, or D1 users. Does not write to production.
- **CLI:** `node scripts/sync-staging-kv.mjs`

## Default agent flow

1. Implement the requested change.
2. `npm run deploy:staging` + smoke (`SMOKE_BASE=https://clad-web-staging.benjaminharriscody.workers.dev npm run smoke`).
3. Tell Ben the staging URL. Wait.
4. Only if he says **push to prod**: `CONFIRM_PROD=1 npm run deploy`.

`npm run deploy` without `CONFIRM_PROD=1` is blocked on purpose.

## Preview toggles (staging only)

Bottom bar on every staging page (notice, spend toggle, and preview controls):

| Control | Query | What it does |
|--|--|--|
| Staging · Not production | — | Desk notice that this Worker is not cladfacts.com |
| ☐ Allow xAI spend (this tab) | — | Opt in to xAI calls for this tab (see Token spend) |
| Account → Live session | `?view=live` | Real cookies (or guest if you are not logged in) |
| Account → Guest | `?view=anon` | Force locked grades, guest hero, paywall, Sign in |
| Account → Signed-in | `?view=signed` | Force fullAccess (real session if present, else a fake preview user) |
| Skin → Current | `?skin=off` | Production Soft Neutral |
| Skin → Cover | `?skin=cover` | Current + one gazette-format full-bleed lead at the top of home. Other strips stay carousels. |
| Skin → Packed / Folio / Broadsheet / Gazette / Cinema / Matrix / Wire | `?skin=packed` etc. | Layout experiments — not recolors. **Gazette** = Folio cover + Broadsheet nameplate. One may later be rebuilt for prod. |

Cookies `clad_stage_view` and `clad_stage_skin` remember the last choice. Staging HTML/JSON is `private, no-store` so the two account views cannot share a cache.

Do **not** copy a selected skin to production unless Ben says **push to prod** after reviewing it.

## Token spend (xAI)

Staging does **not** call xAI unless you opt in. Default is spend-dark.

- Bottom-bar checkbox **Allow xAI spend (this tab)** — adds `X-Clad-Allow-Spend: 1` to fetches.
- Or `allowSpend: true` on the JSON body / `?spend=1` / header `X-Clad-Allow-Spend: 1`.
- A runner pointed at staging skips cron; only `--force=<kind>` or admin Run-now spends.

Approve-without-opt-in still publishes using the YouTube still (no vision, no Imagine).

## Rules

- Staging is **noindex**.
- A **Staging** notice and spend toggle live in the bottom preview bar (not a top ribbon).
- Do **not** run unguarded `wrangler deploy` for experimental work.
- Production is an explicit second step after review.
