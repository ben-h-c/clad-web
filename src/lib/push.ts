import { env } from "cloudflare:workers";

/**
 * APNs (Apple Push Notification service) sending from the Worker, using
 * token-based auth: an ES256 JWT signed with the .p8 auth key, refreshed
 * per send (publishes are infrequent, so we don't cache the token).
 *
 * The Key ID, Team ID, and bundle id are public identifiers, hard-coded so
 * they deploy deterministically with the code. Only APNS_KEY (the private .p8)
 * is a real secret and stays a Worker secret. Push is inert until it's set.
 */

const DEFAULT_BUNDLE_ID = "com.bencody.cladfacts";
// Public identifiers (not secrets); env overrides allowed.
const APNS_KEY_ID = "N88QRFM4D2";
const APNS_TEAM_ID = "R7AV32BX6D";

function keyId(): string { return env.APNS_KEY_ID || APNS_KEY_ID; }
function teamId(): string { return env.APNS_TEAM_ID || APNS_TEAM_ID; }

// Workers have a per-request subrequest cap. One-editor publication, so the
// install base is small; we still cap defensively and log any overflow
// rather than silently dropping recipients.
const MAX_TOKENS_PER_SEND = 800;

export function apnsConfigured(): boolean {
  return !!env.APNS_KEY;
}

interface PushPayload {
  title: string;
  body: string;
  slug: string;
}

interface PushTokenRow {
  token: string;
  environment: string;
}

/**
 * Send a notification to every registered device. Best-effort: individual
 * failures are swallowed; 410/400-BadDeviceToken responses prune the dead
 * token from D1. Returns a small summary for logging.
 */
export async function sendBreakingPush(payload: PushPayload): Promise<{
  sent: number;
  failed: number;
  pruned: number;
  skipped: number;
}> {
  if (!apnsConfigured()) return { sent: 0, failed: 0, pruned: 0, skipped: 0 };

  const rows = await env.DB.prepare(
    "SELECT token, environment FROM push_token"
  ).all<PushTokenRow>();
  const all = rows.results ?? [];
  const tokens = all.slice(0, MAX_TOKENS_PER_SEND);
  const skipped = all.length - tokens.length;
  if (skipped > 0) {
    console.warn(`push: ${all.length} tokens exceeds cap ${MAX_TOKENS_PER_SEND}; ${skipped} not notified this send`);
  }
  if (tokens.length === 0) return { sent: 0, failed: 0, pruned: 0, skipped };

  const bundleId = env.APNS_BUNDLE_ID || DEFAULT_BUNDLE_ID;
  // One JWT covers every send; valid for up to an hour. Sign once per
  // environment-agnostic batch.
  const jwt = await makeProviderToken();

  const apsBody = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
    },
    slug: payload.slug,
    url: `https://cladfacts.com/posts/${payload.slug}/`,
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
          },
          body: apsBody,
        });
        if (res.ok) {
          sent++;
          return;
        }
        failed++;
        // Prune tokens APNs reports as permanently invalid.
        if (res.status === 410) {
          dead.push(row.token);
        } else if (res.status === 400) {
          const reason = await res.text().catch(() => "");
          if (reason.includes("BadDeviceToken")) dead.push(row.token);
        }
      } catch {
        failed++;
      }
    })
  );

  let pruned = 0;
  if (dead.length > 0) {
    // D1 has a variable limit; prune in modest chunks.
    for (let i = 0; i < dead.length; i += 50) {
      const chunk = dead.slice(i, i + 50);
      const placeholders = chunk.map(() => "?").join(",");
      await env.DB.prepare(
        `DELETE FROM push_token WHERE token IN (${placeholders})`
      )
        .bind(...chunk)
        .run();
      pruned += chunk.length;
    }
  }

  return { sent, failed, pruned, skipped };
}

// --- JWT (ES256) -----------------------------------------------------------

async function makeProviderToken(): Promise<string> {
  const header = { alg: "ES256", kid: keyId() };
  // iat must be seconds since epoch; APNs rejects tokens older than 1 hour.
  const claims = { iss: teamId(), iat: Math.floor(Date.now() / 1000) };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = await importPrivateKey(env.APNS_KEY!);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput)
  );
  // Web Crypto ECDSA returns the raw r||s pair, which is exactly the JOSE
  // signature format ES256 expects — no DER unwrapping needed.
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
