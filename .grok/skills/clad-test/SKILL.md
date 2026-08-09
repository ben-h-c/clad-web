---
name: clad-test
description: >
  CladFacts verification and release gates: build, anon leak, smoke, analytics
  health, App Store metadata checks. Use when testing, verifying, shipping,
  /check-work, CI failures, production smoke, or /clad-test.
---

# Clad test & ship gates

## Minimum before push/deploy (web)

```bash
cd ~/clad-web
npm run build
node scripts/checkAnonLeak.mjs
```

CI also: `node scripts/checkImageLicense.mjs` (every post image must be own YT still or `/generated/`).

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

## Runner

- After changing `runner/*.mjs`: `pm2 restart clad-agent-runner`.
- Force: `node --env-file=.env index.mjs --once --force=today-in-history`.

## After a new failure mode

Add a bullet here + decision entry if systemic (clad-knowledge-maintain).
