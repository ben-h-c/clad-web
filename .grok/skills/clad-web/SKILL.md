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
- Auth: Better Auth (readers) + basic-auth for `/admin` and most `/api`. Welcome email (`welcomeEmail.ts`) after email verification (or on create if the provider already verified).
- Agents: `Authorization: Bearer AGENT_TOKEN` on `/api/agent/*`.
- Public APIs must be listed in `src/middleware.ts` `PUBLIC_API` or they return **401**.
- **Email click-throughs:** hrefs use `https://mail.cladfacts.com/...`. Apex AASA must not include `/*` until a shipped iOS binary honors https Universal Links (otherwise Mail opens the app at home). mail.cladfacts.com serves the article; iOS Safari hands off to `cladfacts://post/{slug}` so the current App Store app opens that report. Next iOS build: `applinks:mail.cladfacts.com`.

## Access (do not break)

- `src/lib/access.ts`: `BILLING_ENABLED = false` → every verified signed-in user has `fullAccess`.
- Anon: grades/lean/sentiment never in HTML/JSON (except daily sample). `checkAnonLeak.mjs`.
- Some sections (e.g. today-history) are signed-in only (`!locked` on home).

## Ship discipline (dev-first)

**Default path for every requested change:** code → tests → **staging**. Production only after Ben reviews staging and says **push to prod**.

1. Implement in `~/clad-web`. Commit when the change should survive.
2. **Always** `npm run deploy:staging` (build + isolated Worker). URL: https://clad-web-staging.benjaminharriscody.workers.dev
   Clad Studio: Approve/ship is staging only. Browse staging as **signed-in preview** (`view=signed` / CladStudio UA) so taps are not a register wall. After staging, iPad offers **Push to production** (`promote` → `CONFIRM_PROD=1`) or **Request changes** (follow-up proposal). Companion must never run unguarded `npm run deploy`.
3. Run gates on staging: `SMOKE_BASE=https://clad-web-staging.benjaminharriscody.workers.dev npm run smoke`. For access/HTML work also `npm run check:leak` against staging when practical.
4. **Do not** run `npm run deploy`, `wrangler deploy` (no env), or `CONFIRM_PROD=1` unless Ben explicitly asked to ship production.
5. After approval: `CONFIRM_PROD=1 npm run deploy` (Worker upload, best-effort purge, prod smoke). A missing zone purge token must not fail the ship.
6. Never `wrangler deploy --env staging` after `astro build` — adapter drops env and that hits **prod**. See `docs/staging.md`.
7. Wrangler OAuth: symlink `~/Library/Preferences/.wrangler/config/default.toml` → `~/.wrangler/config/` if empty legacy dir shadows auth.

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
| Access choke point | `src/lib/access.ts` (staging `?view=signed\|anon` preview via ALS) |
| Staging skins | `src/styles/theme-skins.css`, `ThemeSkinBar.astro` — no active experiments (`STAGE_SKINS = []`). Cover is the production home lead |
| Cover ambient clip | Native `<video>` via public `GET /api/ambient/:id` (must stay in `PUBLIC_API`). Bytes in `ambient:clip:<id>` KV. Runner `ambientClip.mjs` (yt-dlp android client). Never a YouTube iframe on the Cover. |
| Anon leak guard | `scripts/checkAnonLeak.mjs` |
| Image license | YouTube own still or `/generated/` only; `docs/legal/image-claims.md` |
| Midterms 2026 board | Seed `src/lib/races.ts`; live overlay `src/lib/elections/liveOverlay.ts` via daily `race-board-auditor` (candidates + dates in KV). Do not hand-edit names for routine primary results. Seat winners: `election-caller` → D1 `race_result` (AP or 2 majors; never a primary). Forecast map: `forecast-refresher`. Roster: `politician-roster-sync`. |

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
- **People in the news:** `src/lib/notablePeople.ts` + roster tags. Anyone notable in recent reports can appear on the strip. **Only roster officeholders get `/politicians/[slug]` report cards.** Everyone else opens the report *about them* (`aboutPersonScore` — headline/topic, not a passing mention in a wrap). Do not tag extracted non-politicians onto `politicians[]`.

## Coding norms

- Prefer small focused files matching existing patterns.
- Admin: `BaseLayout` + `AdminNav`, `prerender = false` when using `cloudflare:workers` env.
- Scanner: channel playlists only — edit policy module, restart `clad-agent-runner`.
- Force agent: `cd runner && node --env-file=.env index.mjs --once --force=<kind>`.
- Midterms live overlay: `npm run check:races`. After auditor code changes, `pm2 restart clad-agent-runner` so production ticks pick up `raceBoardAuditor.mjs`.
- Spend dial: `src/lib/xaiEconomy.ts` / `XAI_ECONOMY`. **Production is full** (2026-08-30). Flip with `runner/.env` + Worker vars + `pm2 restart clad-agent-runner`. `XAI_ECONOMY=economy` is the throttle.
- **Staging never auto-spends xAI.** `src/lib/spendGuard.ts` — opt in via bottom-bar checkbox (`#clad-allow-spend`) / `X-Clad-Allow-Spend`. Runner against staging only runs `--force=` or Run-now. Staging notice is that first bottom-bar row — no top ribbon over the masthead.
- **Refresh staging from prod:** bar button → `POST /api/admin/sync-staging` (`src/lib/syncStagingFromProd.ts`). Staging-only; needs `AGENTS_PROD` binding.

## After engineering lessons

Update this skill + `docs/decisions.md` if architectural (clad-knowledge-maintain). Update `docs/platform-brief.md` if map-level.
