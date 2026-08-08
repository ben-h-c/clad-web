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
npm run build
node scripts/checkAnonLeak.mjs
```

Optional: `node scripts/checkImageLicense.mjs` (CI always runs it).

## Production smoke (infra / analytics / public APIs)

```bash
# Tracker present
curl -sS https://cladfacts.com/ | grep -q clad-analytics.js

# Asset live
curl -sS -o /dev/null -w "%{http_code}\n" https://cladfacts.com/js/clad-analytics.js  # expect 200

# Collect public
curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://cladfacts.com/api/analytics/collect \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: Mozilla/5.0' \
  -d '{"e":"pageview","p":"/","s":"smoke12345678"}'  # expect 204
```

## Product safety

- Anon HTML/JSON must not leak letter grade, factuality, lean, rationales, sentiment (except daily sample).
- `/api/posts.json` additive-only for iOS.

## App Store (iOS)

- Subscriptions require functional Terms of Use + Privacy URLs in App Store Connect metadata (guideline 3.1.2).
- Prefer in-app Terms/Privacy links on paywall too.
- Live: `https://cladfacts.com/terms/`, `https://cladfacts.com/privacy/`.

## After a new failure mode is found

Add a bullet here and a decision entry if systemic (clad-knowledge-maintain).
