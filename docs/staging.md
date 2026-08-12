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

```bash
node scripts/sync-staging-kv.mjs
```

## Default agent flow

1. Implement the requested change.
2. `npm run deploy:staging` + smoke (`SMOKE_BASE=https://clad-web-staging.benjaminharriscody.workers.dev npm run smoke`).
3. Tell Ben the staging URL. Wait.
4. Only if he says **push to prod**: `CONFIRM_PROD=1 npm run deploy`.

`npm run deploy` without `CONFIRM_PROD=1` is blocked on purpose.

## Rules

- Staging is **noindex**.
- A **Staging** bar appears on every page.
- Do **not** run unguarded `wrangler deploy` for experimental work.
- Production is an explicit second step after review.
