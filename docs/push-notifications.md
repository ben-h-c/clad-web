# iOS push notifications

CladFacts notifies iPhone users **sparingly**: standout report cards, marquee daybook items, and a quiet evening desk digest — not every graded segment.

## Design principles (Apple HIG + practice)

1. **Value, not volume** — Prefer rare lock-screen alerts over engagement spam.
2. **Honest urgency** — `active` only for standouts; digests use `passive` (Notification Center, no sound). Never use Time Sensitive for news.
3. **Daily fleet caps** — Max **3** report alerts / NY day (≤2 highlights); **1** calendar push.
4. **Quiet hours** (22:00–07:00 America/New_York) — notables deferred to digest; highlights only if exceptional.
5. **Opt-out that matches the product** — Account prefs: standout reports + daybook highlights (not “every publish”).
6. **Deferred permission** — iOS asks on launch **#3+**, after the user has seen the product.

## Architecture

```
iOS App                          clad-web (Cloudflare Worker)
─────────                        ────────────────────────────
User grants notifications (launch ≥3)
  → APNs device token
  → POST /api/push/register  →  D1 push_token (token, userId?, environment)

Publish graded report
  → maybeSendReportPush()    →  classify (skip | notable | highlight)
       skip  → digest queue
       cap/quiet → digest queue
       else → APNs (capped, interruption-level + relevance-score)

push-reminders agent
  morning → marquee calendar “today” (if any)
  evening → passive desk digest + optional passive “tomorrow” marquee

Admin test
  → GET/POST /api/admin/push (basic auth)
```

## What fires when

| Kind | When | Interruption | Cap |
|------|------|--------------|-----|
| `report` / **highlight** | Featured, A+/F, marquee civic topics | `active` + sound | ≤2 / NY day |
| `report` / **notable** | Extreme grades / high-signal civic + non-B grade | `active`, no sound | shares ≤3 report alerts / day |
| `digest` | Evening: grades that skipped lock-screen | `passive`, no sound | 1 / NY day |
| `event` | Marquee calendar only (debate, SCOTUS, election…) | today: `active` soft; tomorrow: `passive` | 1 calendar / NY day |
| `test` | Admin | `active` | — |

Routine talk-show grades **do not** push. They may appear in the evening digest only.

## Apple Developer / secrets

1. **App ID** `com.bencody.cladfacts`: Push Notifications capability.
2. **APNs Auth Key (.p8)** — Key ID default `N88QRFM4D2`, Team `R7AV32BX6D`.
3. Store private key as Worker secret `APNS_KEY` or KV `secret:APNS_KEY`.
4. D1: `db/push-schema.sql` (`push_token` table).

## Prefs (signed-in)

| Pref | Default | Meaning |
|------|---------|---------|
| `pushReports` | on | Standouts + evening digest |
| `pushEvents` | on | Marquee daybook only |
| `breakingAlerts` | off | **Email** high-impact Breaking (not APNs) |

Anonymous devices that allowed system notifications still receive pushes (no account prefs).

## iOS client

- `AppDelegate`: permission from launch **#3** onward.
- `PushManager`: POSTs token + sandbox/production; refresh on become-active / sign-in.
- Tap opens `url` / `path` / `slug` from payload.

## Test

```bash
# Status
curl -u "$ADMIN_USER:$ADMIN_PASSWORD" https://cladfacts.com/api/admin/push

# Test fan-out
curl -u "$ADMIN_USER:$ADMIN_PASSWORD" -X POST https://cladfacts.com/api/admin/push \
  -H 'content-type: application/json' \
  -d '{"title":"CladFacts","body":"Test push","path":"/"}'

# Dry-run calendar / digest
curl -X POST https://cladfacts.com/api/agent/push-reminders \
  -H "authorization: Bearer $AGENT_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"dryRun":true,"mode":"today"}'

curl -X POST https://cladfacts.com/api/agent/push-reminders \
  -H "authorization: Bearer $AGENT_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"dryRun":true,"mode":"digest"}'
```

Physical iPhone only (simulator has no APNs). Debug = sandbox tokens; TestFlight/App Store = production.
