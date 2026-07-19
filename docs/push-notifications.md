# iOS push notifications

CladFacts can notify iPhone users when a **new graded report** publishes and when the **news calendar** has key events today/tomorrow.

## Architecture

```
iOS App                          clad-web (Cloudflare Worker)
─────────                        ────────────────────────────
User grants notifications
  → APNs device token
  → POST /api/push/register  →  D1 push_token (token, userId?, environment)

Publish graded report
  → sendBreakingPush()       →  APNs → all devices (prefs opt-out)

push-reminders agent (2×/day)
  → POST /api/agent/push-reminders
  → sendEventPush()          →  APNs calendar daybook ping

Admin test
  → GET/POST /api/admin/push (basic auth)
```

## Apple Developer / secrets

1. **App ID** `com.bencody.cladfacts`: Push Notifications capability (already in Debug/Release entitlements `aps-environment`).
2. **APNs Auth Key (.p8)** in the Apple Developer portal (Keys).
   - Key ID is hard-coded as `N88QRFM4D2` (override with `APNS_KEY_ID`).
   - Team ID `R7AV32BX6D` (override with `APNS_TEAM_ID`).
3. Store the **private key** (full `.p8` PEM text) in AGENTS KV:

```bash
# From clad-web
printf '%s' "$(cat AuthKey_XXXXX.p8)" | npx wrangler kv key put --binding AGENTS "secret:APNS_KEY" --path /dev/stdin
# Or: wrangler secret put APNS_KEY
```

4. D1 table (already applied in production):

```bash
npx wrangler d1 execute clad-users --remote --file db/push-schema.sql
```

5. Redeploy the Worker after adding the key so `apnsConfigured()` sees it.

## What fires when

| Kind | Trigger | Title / body |
|------|---------|--------------|
| `report` | `POST /api/publish` (non-draft) | “New report card” + headline |
| `event` | Agent `push-reminders` @ 12:30 & 23:30 UTC | “Today/Tomorrow on the calendar” + top event |
| `test` | Admin `POST /api/admin/push` | Custom |

Signed-in users can opt out on **Account → iPhone — new report cards / calendar reminders**. Anonymous devices that allowed system notifications still receive pushes.

## iOS client

- `AppDelegate` requests permission from launch **#2** onward (not cold start #1).
- `PushManager` POSTs token + `sandbox`/`production` environment; re-uploads on become-active and after native sign-in.
- Tap opens `url` / `path` / `slug` from the payload (report card, home daybook, etc.).

## Test

```bash
# Status (admin basic auth)
curl -u "$ADMIN_USER:$ADMIN_PASSWORD" https://cladfacts.com/api/admin/push

# Test fan-out
curl -u "$ADMIN_USER:$ADMIN_PASSWORD" -X POST https://cladfacts.com/api/admin/push \
  -H 'content-type: application/json' \
  -d '{"title":"CladFacts","body":"Test push — you should see this.","path":"/"}'

# Dry-run calendar reminder
# (agent token)
curl -X POST https://cladfacts.com/api/agent/push-reminders \
  -H "authorization: Bearer $AGENT_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"dryRun":true,"mode":"today"}'
```

Use a **physical iPhone** (simulator has no APNs). Debug builds use the sandbox APNs host; App Store / TestFlight production use production APNs — tokens are environment-specific.
