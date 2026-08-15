---
name: clad-test
description: >
  CladFacts verification and release gates: build, anon leak, smoke, analytics
  health, App Store metadata checks. Use when testing, verifying, shipping,
  /check-work, CI failures, production smoke, or /clad-test.
---

# Clad test & ship gates

## Dev-first (mandatory)

No production deploy until Ben reviewed **staging** and said push to prod (chat or Clad Studio **Push to production**).

```bash
cd ~/clad-web
npm run deploy:staging
SMOKE_BASE=https://clad-web-staging.benjaminharriscody.workers.dev npm run smoke
# After approval only:
CONFIRM_PROD=1 npm run deploy
```

## Minimum before staging (and again before prod)

```bash
cd ~/clad-web
npm run build
# leak check when the change touches HTML/JSON/access:
node scripts/checkAnonLeak.mjs
```

CI also: `node scripts/checkImageLicense.mjs` (every post image must be own YT still or `/generated/`).

## Media / image gates

- **License:** post art path must be own YouTube still or `/generated/` — never third-party wire/Reuters/etc. (`docs/legal/image-claims.md`).
- **Always-image:** approved strip cards should not ship with empty media voids. `stillQuality: fail` without a `/generated/` illustration (and without Force show) is a product bug — see `docs/decisions.md` always-image entry.
- **Commons KV:** do not store unvalidated thumb URLs. After Commons pipeline changes, force-run agents that write `imageUrl` (`today-in-history`, human-spotlight, etc.) and spot-check live tiles for 400 thumbs / wrong-person portraits.
- Spot-check: homepage Breaking/Topic rows show 16:9 art; Spotlight monogram when no portrait; history full-bleed Commons only.

## Production smoke (infra / analytics / public APIs)

```bash
curl -sS https://cladfacts.com/ | grep -q clad-analytics.js
curl -sS -o /dev/null -w "%{http_code}\n" https://cladfacts.com/js/clad-analytics.js   # 200
curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://cladfacts.com/api/analytics/collect \
  -H 'Content-Type: application/json' -H 'User-Agent: Mozilla/5.0' \
  -d '{"e":"pageview","p":"/","s":"smoke12345678"}'   # 204
```

## Product safety

- Anon HTML/JSON must not leak letter grade, factuality, lean, rationales, sentiment (except daily sample).
- `/api/posts.json` additive-only for iOS; grades null when anon.
- `BILLING_ENABLED` false: do not reintroduce hard paywalls without owner decision.

## App Store (iOS)

- Subscriptions: Terms of Use + Privacy URLs in App Store Connect (guideline 3.1.2).
- Live: `https://cladfacts.com/terms/`, `https://cladfacts.com/privacy/`.
- Prefer in-app Terms/Privacy on paywall too.
- **Sign in with Apple (Guideline 4):** the iOS app must show
  `ASAuthorizationAppleIDButton` (see `cladfacts-ios` `AppleSignInButton.swift`).
  Never ship a custom Apple mark, SF Symbol `apple.logo`, or Font Awesome apple
  on the SIWA control. The clad-web HTML Apple button is hidden in-app.
- **Version train:** after a version is approved, that `CFBundleShortVersionString`
  is closed. The next archive must bump `MARKETING_VERSION` in `cladfacts-ios/project.yml`
  (app + widget) **and** `CURRENT_PROJECT_VERSION`. Build-only bumps fail 90062 / 90186.
  Closed: 1.0.2, 1.0.5. Current: **1.0.6 (9)**. Then `xcodegen generate`.

## Runner

- After changing `runner/*.mjs`: `pm2 restart clad-agent-runner`.
- Force: `node --env-file=.env index.mjs --once --force=today-in-history`.

## After a new failure mode

Add a bullet here + decision entry if systemic (clad-knowledge-maintain).
