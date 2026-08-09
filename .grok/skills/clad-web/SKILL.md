---
name: clad-web
description: >
  CladFacts web engineering: Astro 6, Cloudflare Worker, D1, KV agents, runner.
  Use when coding clad-web features, APIs, middleware, admin pages, deploy,
  wrangler, analytics, YouTube scanner integration, or /clad-web.
---

# Clad web engineering

## Read first

- `docs/platform-brief.md` (architecture map)
- `AGENTS.md` continuous learning

## Stack

- Astro 6 + `@astrojs/cloudflare`, D1 `DB`, KV `AGENTS`, runner `runner/` (PM2 `clad-agent-runner`).
- Auth: Better Auth (readers) + basic-auth for `/admin` and most `/api`.
- Agents: `Authorization: Bearer AGENT_TOKEN` on `/api/agent/*`.
- Public APIs must be listed in `src/middleware.ts` `PUBLIC_API` or they return **401**.

## Access (do not break)

- `src/lib/access.ts`: `BILLING_ENABLED = false` → every verified signed-in user has `fullAccess`.
- Anon: grades/lean/sentiment never in HTML/JSON (except daily sample). `checkAnonLeak.mjs`.
- Some sections (e.g. today-history) are signed-in only (`!locked` on home).

## Ship discipline

1. **Commit to git** before/with deploy — uncommitted work dies on next main deploy.
2. `npm run build` then `./node_modules/.bin/wrangler deploy` (project-local wrangler).
3. Wrangler OAuth: symlink `~/Library/Preferences/.wrangler/config/default.toml` → `~/.wrangler/config/` if empty legacy dir shadows auth.
4. After infra deploys smoke live: HTML includes scripts, asset **200**, public POST **204**.
5. Full script: `npm run deploy` also purgeCache + smoke-anon.

## Key surfaces

| Feature | Paths |
|---------|--------|
| Analytics collect | `POST /api/analytics/collect` (public), `src/lib/analytics.ts`, `public/js/clad-analytics.js` |
| Analytics admin | `/admin/analytics/` |
| YT scanner policy | `src/lib/youtubeScannerPolicy.ts`, `/admin/youtube-scanner/` |
| Today in history | `runner/todayInHistory.mjs`, KV `home:today-in-history`, Commons-only heroes |
| Human spotlight | runner + KV; Commons portrait only if wiki title matches person |
| Commons hygiene | `src/lib/commonsMedia.ts`, `runner/commonsMedia.mjs` |
| Home layout | `src/lib/homeLayout.ts` FIXED_HOME_TOP + DEFAULT_HOME_ORDER |
| Access choke point | `src/lib/access.ts` |
| Anon leak guard | `scripts/checkAnonLeak.mjs` |
| Image license | YouTube own still or `/generated/` only; `docs/legal/image-claims.md` |

## Media pipeline (do not re-litigate)

**Always-image (report cards / strips)** — see `docs/decisions.md` 2026-08-08:

- Vision scores `stillQuality`: `pass` | `weak` | `fail`.
- **`fail` → generate site-owned editorial art under `/generated/`**, set `mediaStyle: overlay`; keep `stillQuality: fail` as audit of the *broadcast* still.
- Editor controls: **Use photo** / **Use illustration** / **Force show** (YT still even on fail).
- **Hide-photo is not a product option** for strip cards. Empty “Hold for preview” tiles are a bug.
- If generation fails, fall back to YT still (not a blank void).
- Legal: only own YT still or `/generated/` (`docs/legal/image-claims.md`). Economy/bulk may skip vision and keep the still.

**Commons thumbs & portraits:**

- Shared hygiene: `src/lib/commonsMedia.ts` + `runner/commonsMedia.mjs`.
- Strip query params; **never invent unchecked widths** (arbitrary 440/640 often 400). Safe candidates **330 → 500 → 960** only with HEAD/GET validation before writing `imageUrl` to AGENTS KV.
- Re-enrich same-day packs when a stored URL fails validation (not only when null).
- **Human Spotlight:** accept Commons portrait only when Wikipedia title clearly matches the person; else `imageUrl = null` and UI monogram. Monogram underlay + `onerror` remove.
- **Today in history:** Commons-only heroes (no YouTube posters); multi-fallback resolve; on image error drop media layer (no broken `?` glyph).
- Politician portraits: Commons via `/api/politician-photo/`.

## Coding norms

- Prefer small focused files matching existing patterns.
- Admin: `BaseLayout` + `AdminNav`, `prerender = false` when using `cloudflare:workers` env.
- Scanner: channel playlists only — edit policy module, restart `clad-agent-runner`.
- Force agent: `cd runner && node --env-file=.env index.mjs --once --force=<kind>`.
- Economy caps: `src/lib/xaiEconomy.ts` / `XAI_ECONOMY`.

## After engineering lessons

Update this skill + `docs/decisions.md` if architectural (clad-knowledge-maintain). Update `docs/platform-brief.md` if map-level.
