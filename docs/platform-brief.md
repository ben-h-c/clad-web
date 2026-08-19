# CladFacts platform brief (expert cold-start)

**Audience for this doc:** Grok Build / agents opening clad-web (or related repos).  
**Read order:** this file → `AGENTS.md` → domain skill → source of truth file.  
**Last bootcamp:** 2026-08-09.

---

## 1. What Clad is

CladFacts grades **news broadcasts** (accuracy letter grade, factuality, political lean, social sentiment). Agents draft report cards; an editor approves; posts land as **git-committed markdown** under `src/content/posts/` (~4k posts). Site: **https://cladfacts.com**.

**Target reader:** ~16–24, first serious news habit. Soft modern UI, no clickbait. See `docs/daily-review.md`.

---

## 2. Repos

| Path | Role |
|------|------|
| `~/clad-web` | Astro 6 site + Worker + D1/KV + `runner/` agents |
| `~/cladfacts-ios` | Native iOS app + widgets (App Store id **6781372681**) |
| `~/cladfacts-design-studio` | iPad Clad Studio + Mac companion (design packets → Grok) |

Primary product code for the website is **clad-web**.

---

## 3. Runtime architecture

```
Browser / iOS
    ↓ HTTPS
Cloudflare Worker (astro + @astrojs/cloudflare)
    ├── AGENTS KV  — drafts, agent registry, home bundle, today-in-history, layout…
    ├── DB (D1)    — Better Auth users, subscriptions, analytics aggregates, comments…
    └── ASSETS     — static (e.g. /js/clad-analytics.js)

Mac PM2: clad-agent-runner  →  calls /api/agent/* with AGENT_TOKEN
    └── youtube scanner, curators, today-in-history, etc.
```

**Wrangler bindings (wrangler.jsonc):**

- `AGENTS` KV `231fcd9c…`
- `DB` D1 `clad-users` `afb89ef5…`
- Rate limits: `FACTCHECK_LIMITER`, `CAMPAIGN_LIMITER`
- Routes: cladfacts.com + www custom domains

**Deploy (web):**

```bash
cd ~/clad-web
npm run deploy:staging          # default — isolated Worker, not cladfacts.com
# After Ben reviews staging and says push to prod:
CONFIRM_PROD=1 npm run deploy
```

See `docs/staging.md`. Never `wrangler deploy --env staging` after `astro build` (hits prod).

**Wrangler auth footgun:** if `~/.wrangler` exists empty, OAuth in `~/Library/Preferences/.wrangler/config/default.toml` is ignored. Symlink `default.toml` into `~/.wrangler/config/`.

**Runner:**

```bash
pm2 list                    # clad-agent-runner
cd ~/clad-web/runner
node --env-file=.env index.mjs --once --force=<kind>
```

Spend: production is **economy** (`XAI_ECONOMY=economy` on runner + Worker, 2026-08-19). `XAI_ECONOMY=full` is max volume. Staging is spend-dark unless opted in (`src/lib/spendGuard.ts`).

---

## 4. Access model (critical)

Source: `src/lib/access.ts`.

| State | `fullAccess` | Notes |
|-------|--------------|--------|
| Anon | false | Grades/lean locked |
| Signed-in, email verified (or social) | **true** while `BILLING_ENABLED === false` | Current production |
| Paid Stripe/Apple | true when billing on | Framework kept |

**`BILLING_ENABLED = false` today** — hide Premium upsells; every verified account gets full platform features.

**Anon leak (non-negotiable):** letter grade, factuality, lean, rationales, social sentiment must **never** reach anonymous HTML/JSON except daily sample carve-out.  
Gate: `node scripts/checkAnonLeak.mjs` (CI on every push).  
Choke point for product logic: `getAccess()`.

Some home modules (e.g. **Today in history**) render only when `!locked` (signed-in full access).

---

## 5. Auth surfaces

| Who | How |
|-----|-----|
| Readers | Better Auth (`/api/auth/*`, session cookie) |
| Editor admin | HTTP basic auth (`ADMIN_USER` / `ADMIN_PASSWORD`) on `/admin/*` and most `/api/*` |
| Agents | `Authorization: Bearer AGENT_TOKEN` on `/api/agent/*` |
| Public APIs | Explicit allowlist in `src/middleware.ts` `PUBLIC_API` |

If a new public endpoint 401s, it was forgotten on the allowlist (analytics collect once failed this way).

---

## 6. Content & images

- Posts: `src/content/posts/*.md` frontmatter + body.
- **Image policy (legal):** post art = own YouTube still **or** `/generated/` only. See `docs/legal/image-claims.md`. CI: `scripts/checkImageLicense.mjs`.

### Always-image (report cards / home strips)

- Designer rule: cards always show a **16:9** image — no empty “Hold for preview” tiles.
- Vision scores `stillQuality` (`pass` | `weak` | `fail`). **`fail` → generate owned editorial art under `/generated/`**, `mediaStyle: overlay`; keep `stillQuality: fail` as audit of the broadcast still.
- Editor: **Use photo** / **Use illustration** / **Force show**. Hide-photo is not a product option for strip cards. Generation failure falls back to YT still.
- Full decision: `docs/decisions.md` — “Always image: still fail → owned illustration”.

### Commons hygiene (spotlight, history, politicians)

- Shared modules: `src/lib/commonsMedia.ts`, `runner/commonsMedia.mjs`.
- Never invent unchecked thumb widths; validate safe sizes (**330 → 500 → 960**) with HEAD/GET before writing `imageUrl` to AGENTS KV. Re-enrich when a stored URL fails.
- **Human Spotlight:** Commons portrait only if Wikipedia title matches the person; else monogram (`imageUrl = null`).
- **Today in history:** Commons-only heroes (no YouTube posters); multi-fallback in `runner/todayInHistory.mjs`; drop media layer on image error.
- **Politicians:** Commons via proxy `/api/politician-photo/`.
- Decision: `docs/decisions.md` — “Commons thumbs: no invented widths + validate before store”.

### Topic tiles (UI)

- Dual-layer stills on `TopicRow` (bloom + subject) — see `docs/design-system.md`. Not a new art pipeline; CSS fix for letterboxing.

---

## 7. Agents (high level)

Registry seed: `src/lib/agents.ts` `DEFAULT_REGISTRY`. Kinds include:

`youtube-scanner`, `frontpage-curator`, `breaking-news-curator`, `discover-curator`, `good-news-curator`, `home-layout-curator`, `today-in-history`, `human-spotlight`, `calendar-scanner`, `politician-*`, `social-sentiment-scanner`, `compliance-auditor`, digests, push, retention…

**YouTube news scanner:** does **not** keyword-search. Watches **allow-listed channel upload playlists** (`src/lib/youtubeScannerPolicy.ts`). Admin read-only criteria: `/admin/youtube-scanner/`. Manual URLs: admin intake + url queue.

**Home layout:** `src/lib/homeLayout.ts` — fixed top stack (feature → breaking → front-page → lean), then flexible middle (calendar, topics, election-map, grades, today-history, discover, good-news, more-feed…).

---

## 8. Analytics

Privacy-first first-party aggregates. No PII / cookies for analytics.

| Piece | Path |
|-------|------|
| Client | `public/js/clad-analytics.js` (BaseLayout, non-admin) |
| Collect | `POST /api/analytics/collect` **must be public** |
| Lib | `src/lib/analytics.ts` |
| Admin | `/admin/analytics/` |
| Schema | `db/analytics-schema.sql` (D1) |

Commit + deploy assets; smoke 200 on JS and 204 on collect after ship.

---

## 9. Admin desk

Basic-auth. Nav groups: Desk (queue, intake, posts), Readers (users, **analytics**, flags, comments, email), Ops (agents, **YT scanner criteria**, marketing, compliance, results, stats, health).

Pending drafts / flags badges from KV.

---

## 10. iOS

- Feed: `GET /api/posts.json` — **additive fields only**; grades null when anon.
- Session unlocks premium fields (SessionBridge).
- IAP: `/api/iap/apple*`; push: `/api/push/*`.
- App Store: subscriptions need Terms + Privacy URLs in metadata (3.1.2). Live: `/terms/`, `/privacy/`.
- Universal links team R7AV32BX6D / com.bencody.cladfacts.

---

## 11. Clad Studio (design → code)

- iPad app packs annotated screens + notes → zip Design Packet.
- Mac companion: LaunchAgent `com.bencody.cladstudio.inbox`, HTTP **:8765**, inbox `~/CladFacts-Design-Inbox/`.
- Jobs: `mac-companion/run-job.mjs` — Grok headless via **`--prompt-file`** (never bare `-p`).
- cwd for implement: `~/clad-web`. Status machine: received → proposing → awaiting_review → implementing → shipped (staging) → promoting → live | failed. Approve never deploys production.

---

## 12. Design system

Soft Neutral Card — `docs/design-system.md` + `src/styles/global.css`.  
Accent teal `#5b9a8b` / dark `#6fb5a4`; parchment paper; dark default for guests; admin forced dark.

---

## 13. Verify before claiming done

```bash
npm run build
node scripts/checkAnonLeak.mjs
# if infra: smoke analytics JS 200 + collect 204
```

---

## 14. Knowledge maintenance

When you learn something durable: **same turn** update `docs/decisions.md` and/or the matching `.grok/skills/clad-*` skill and/or Memory. Skill: `clad-knowledge-maintain`.  
Hooks remind on SessionStart / PreCompact (trust project hooks if needed).
