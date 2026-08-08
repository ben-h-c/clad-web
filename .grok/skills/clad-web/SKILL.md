---
name: clad-web
description: >
  CladFacts web engineering: Astro 6, Cloudflare Worker, D1, KV agents, runner.
  Use when coding clad-web features, APIs, middleware, admin pages, deploy,
  wrangler, analytics, YouTube scanner integration, or /clad-web.
---

# Clad web engineering

## Stack

- Astro 6 + `@astrojs/cloudflare`, D1 `DB`, KV `AGENTS`, runner `runner/`.
- Auth: Better Auth (readers) + basic-auth for `/admin` and most `/api`.
- Public APIs must be listed in `src/middleware.ts` `PUBLIC_API` or they return 401.

## Ship discipline

1. **Commit to git** before/with deploy — uncommitted work dies on next main deploy.
2. `npm run build` then `./node_modules/.bin/wrangler deploy` (prefer project wrangler).
3. If wrangler says non-interactive / no token: ensure `~/.wrangler/config/default.toml` links to Preferences OAuth.
4. After infra deploys, smoke live: HTML script tags, asset 200s, public POST 204.

## Key surfaces

| Feature | Paths |
|---------|--------|
| Analytics collect | `POST /api/analytics/collect` (public), `src/lib/analytics.ts`, `public/js/clad-analytics.js` |
| Analytics admin | `/admin/analytics/` |
| YT scanner policy | `src/lib/youtubeScannerPolicy.ts`, `/admin/youtube-scanner/` |
| Access choke point | `src/lib/access.ts` |
| Anon leak guard | `scripts/checkAnonLeak.mjs` |

## Coding norms

- Prefer small focused files matching existing patterns.
- Admin pages: `BaseLayout` + `AdminNav`, `prerender = false` when using env.
- Do not invent new analytics third parties.
- Scanner: channel playlists only — edit policy module, restart `clad-agent-runner` PM2.

## After engineering lessons

Update this skill + `docs/decisions.md` if architectural (clad-knowledge-maintain).
