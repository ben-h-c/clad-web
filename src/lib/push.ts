import { env } from "cloudflare:workers";

/**
 * APNs (Apple Push Notification service) from the Worker, using token-based
 * auth: an ES256 JWT signed with the .p8 auth key.
 *
 * Key ID / Team ID are public identifiers (hard-coded; env can override).
 * Only APNS_KEY (private .p8) is a real secret — Worker secret or KV
 * `secret:APNS_KEY`. Push is inert until the key is set.
 *
 * Kinds:
 *  - report  — new graded report (publish path)
 *  - event   — calendar daybook reminder
 *  - test    — admin/agent test ping
 */

const DEFAULT_BUNDLE_ID = "com.bencody.cladfacts";
const APNS_KEY_ID = "N88QRFM4D2";
const APNS_TEAM_ID = "R7AV32BX6D";

function keyId(): string {
  return env.APNS_KEY_ID || APNS_KEY_ID;
}
function teamId(): string {
  return env.APNS_TEAM_ID || APNS_TEAM_ID;
}

async function getApnsKey(): Promise<string | null> {
  if (env.APNS_KEY) return env.APNS_KEY;
  try {
    return (await env.AGENTS.get("secret:APNS_KEY")) || null;
  } catch {
    return null;
  }
}

const MAX_TOKENS_PER_SEND = 800;

export async function apnsConfigured(): Promise<boolean> {
  return !!(await getApnsKey());
}

export type PushKind = "report" | "event" | "test";

export interface PushPayload {
  title: string;
  body: string;
  /** Deep-link path on cladfacts.com, e.g. /posts/slug/ or / (calendar). */
  path: string;
  kind: PushKind;
  /** Optional post slug for legacy iOS payloads. */
  slug?: string;
}

interface PushTokenRow {
  token: string;
  environment: string;
  userId: string | null;
}

export interface PushSendResult {
  sent: number;
  failed: number;
  pruned: number;
  skipped: number;
  recipients: number;
}

/** New graded report — fan-out to all devices (opt-out via prefs.pushReports). */
export async function sendBreakingPush(input: {
  title: string;
  body: string;
  slug: string;
}): Promise<PushSendResult> {
  return sendPush({
    title: input.title,
    body: input.body,
    path: `/posts/${input.slug}/`,
    kind: "report",
    slug: input.slug,
  });
}

/** Calendar daybook reminder (today/tomorrow events). */
export async function sendEventPush(input: {
  title: string;
  body: string;
  path?: string;
}): Promise<PushSendResult> {
  return sendPush({
    title: input.title,
    body: input.body,
    path: input.path || "/",
    kind: "event",
  });
}

/**
 * Send a notification. Best-effort: individual failures are swallowed;
 * 410/BadDeviceToken prune dead rows. Anonymous tokens always receive;
 * signed-in tokens honor pushReports / pushEvents prefs (default on).
 */
export async function sendPush(payload: PushPayload): Promise<PushSendResult> {
  if (!(await apnsConfigured())) {
    return { sent: 0, failed: 0, pruned: 0, skipped: 0, recipients: 0 };
  }

  const rows = await env.DB.prepare(
    "SELECT token, environment, userId FROM push_token"
  ).all<PushTokenRow>();
  let all = rows.results ?? [];

  // Prefs filter for signed-in devices (anonymous devices already opted in via iOS).
  if (payload.kind === "report" || payload.kind === "event") {
    const prefKey = payload.kind === "report" ? "pushReports" : "pushEvents";
    const withUser = all.filter((r) => r.userId);
    if (withUser.length) {
      const optOut = await loadPushOptOuts(
        withUser.map((r) => r.userId!).filter(Boolean),
        prefKey
      );
      all = all.filter((r) => !r.userId || !optOut.has(r.userId));
    }
  }

  const tokens = all.slice(0, MAX_TOKENS_PER_SEND);
  const skipped = all.length - tokens.length;
  if (skipped > 0) {
    console.warn(
      `push: ${all.length} tokens exceeds cap ${MAX_TOKENS_PER_SEND}; ${skipped} not notified`
    );
  }
  if (tokens.length === 0) {
    return { sent: 0, failed: 0, pruned: 0, skipped, recipients: 0 };
  }

  const bundleId = env.APNS_BUNDLE_ID || DEFAULT_BUNDLE_ID;
  const jwt = await makeProviderToken();
  const path = payload.path.startsWith("/") ? payload.path : `/${payload.path}`;
  const absoluteUrl = `https://cladfacts.com${path}`;

  const apsBody = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
      // Group related pushes in Notification Center.
      "thread-id": payload.kind,
    },
    kind: payload.kind,
    slug: payload.slug ?? null,
    path,
    url: absoluteUrl,
  });

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];

  await Promise.all(
    tokens.map(async (row) => {
      const host =
        row.environment === "sandbox"
          ? "https://api.sandbox.push.apple.com"
          : "https://api.push.apple.com";
      try {
        const res = await fetch(`${host}/3/device/${row.token}`, {
          method: "POST",
          headers: {
            authorization: `bearer ${jwt}`,
            "apns-topic": bundleId,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "apns-collapse-id":
              payload.kind === "report" && payload.slug
                ? `report-${payload.slug}`.slice(0, 64)
                : payload.kind,
          },
          body: apsBody,
        });
        if (res.ok) {
          sent++;
          return;
        }
        failed++;
        if (res.status === 410) {
          dead.push(row.token);
        } else if (res.status === 400) {
          const reason = await res.text().catch(() => "");
          if (reason.includes("BadDeviceToken") || reason.includes("Unregistered")) {
            dead.push(row.token);
          }
        }
      } catch {
        failed++;
      }
    })
  );

  let pruned = 0;
  if (dead.length > 0) {
    for (let i = 0; i < dead.length; i += 50) {
      const chunk = dead.slice(i, i + 50);
      const placeholders = chunk.map(() => "?").join(",");
      await env.DB.prepare(`DELETE FROM push_token WHERE token IN (${placeholders})`)
        .bind(...chunk)
        .run();
      pruned += chunk.length;
    }
  }

  return { sent, failed, pruned, skipped, recipients: tokens.length };
}

/** userIds who explicitly opted out of a push kind (prefs key === false). */
async function loadPushOptOuts(userIds: string[], prefKey: string): Promise<Set<string>> {
  const unique = [...new Set(userIds)].slice(0, 500);
  if (!unique.length) return new Set();
  const out = new Set<string>();
  // Batch IN queries of 80.
  for (let i = 0; i < unique.length; i += 80) {
    const chunk = unique.slice(i, i + 80);
    const ph = chunk.map(() => "?").join(",");
    const res = await env.DB.prepare(
      `SELECT userId, prefs FROM user_preferences WHERE userId IN (${ph})`
    )
      .bind(...chunk)
      .all<{ userId: string; prefs: string }>();
    for (const row of res.results ?? []) {
      try {
        const p = JSON.parse(row.prefs) as Record<string, unknown>;
        // Explicit false only — missing key means default on.
        if (p[prefKey] === false) out.add(row.userId);
      } catch {
        /* ignore bad prefs */
      }
    }
  }
  return out;
}

// --- JWT (ES256) -----------------------------------------------------------

async function makeProviderToken(): Promise<string> {
  const header = { alg: "ES256", kid: keyId() };
  const claims = { iss: teamId(), iat: Math.floor(Date.now() / 1000) };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const pem = await getApnsKey();
  if (!pem) throw new Error("APNS_KEY not configured");
  const key = await importPrivateKey(pem);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64urlBytes(new Uint8Array(signature))}`;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

function b64url(s: string): string {
  return b64urlBytes(new TextEncoder().encode(s));
}

function b64urlBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
