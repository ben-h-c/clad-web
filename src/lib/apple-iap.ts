import { env } from "cloudflare:workers";

/**
 * Apple In-App Purchase verification via the App Store Server API.
 *
 * Rather than hand-rolling x5c certificate-chain verification of StoreKit JWS
 * blobs in the Worker, we ask Apple directly: the client sends its
 * originalTransactionId, and we call Apple's authenticated App Store Server
 * API to get the *authoritative* subscription status. The response travels
 * over TLS from Apple's endpoint, so we decode the embedded signed JWS
 * payloads without re-verifying their signatures (the transport authenticates
 * Apple). A forged transaction id simply isn't found → no entitlement.
 *
 * Inert until the IAP key is configured (APPLE_IAP_KEY/_KEY_ID/_ISSUER_ID).
 */

const DEFAULT_BUNDLE_ID = "com.bencody.cladfacts";
const PROD_BASE = "https://api.storekit.itunes.apple.com";
const SANDBOX_BASE = "https://api.storekit-sandbox.itunes.apple.com";

export function iapConfigured(): boolean {
  return !!(env.APPLE_IAP_KEY && env.APPLE_IAP_KEY_ID && env.APPLE_IAP_ISSUER_ID);
}

export interface AppleStatus {
  /** active if the subscription is in a paid/grace state and not past expiry. */
  active: boolean;
  productId: string | null;
  /** ISO string, or null. */
  expiresAt: string | null;
  originalTransactionId: string;
}

// App Store Server API subscription status codes.
//   1 active · 2 expired · 3 billing-retry · 4 billing-grace · 5 revoked
const ACTIVE_STATUSES = new Set([1, 4]);

/**
 * Fetch authoritative subscription status for an originalTransactionId.
 * Tries the given environment first, then the other (TestFlight/sandbox
 * purchases live in sandbox, App Store in production) per Apple's guidance.
 */
export async function getAppleSubscriptionStatus(
  originalTransactionId: string,
  environment: "sandbox" | "production" = "production"
): Promise<AppleStatus | null> {
  if (!iapConfigured()) return null;
  const order =
    environment === "sandbox" ? [SANDBOX_BASE, PROD_BASE] : [PROD_BASE, SANDBOX_BASE];

  for (const base of order) {
    const res = await callStatus(base, originalTransactionId);
    if (res === "not-found") continue; // try the other environment
    return res;
  }
  return null;
}

async function callStatus(
  base: string,
  originalTransactionId: string
): Promise<AppleStatus | "not-found" | null> {
  const jwt = await makeApiToken();
  const res = await fetch(`${base}/inApps/v1/subscriptions/${originalTransactionId}`, {
    headers: { authorization: `Bearer ${jwt}` },
  });
  if (res.status === 404) return "not-found";
  if (!res.ok) return null;

  const body = await res.json<any>().catch(() => null);
  // Find the lastTransactions entry for this originalTransactionId.
  const groups = body?.data ?? [];
  for (const g of groups) {
    for (const t of g.lastTransactions ?? []) {
      if (t.originalTransactionId !== originalTransactionId) continue;
      const info = decodeJwsPayload(t.signedTransactionInfo);
      const expiresMs = typeof info?.expiresDate === "number" ? info.expiresDate : null;
      return {
        active: ACTIVE_STATUSES.has(t.status) && (!expiresMs || expiresMs > Date.now()),
        productId: info?.productId ?? null,
        expiresAt: expiresMs ? new Date(expiresMs).toISOString() : null,
        originalTransactionId,
      };
    }
  }
  return "not-found";
}

/** Decode a JWS payload without signature verification (TLS-authenticated). */
export function decodeJwsPayload(jws: string | undefined | null): any {
  if (!jws) return null;
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = new TextDecoder().decode(b64urlBytes(parts[1]));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// --- App Store Server API auth token (ES256 JWT) ---------------------------

async function makeApiToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: env.APPLE_IAP_KEY_ID!, typ: "JWT" };
  const payload = {
    iss: env.APPLE_IAP_ISSUER_ID!,
    iat: now,
    exp: now + 20 * 60,
    aud: "appstoreconnect-v1",
    bid: env.APPLE_APP_BUNDLE_ID || DEFAULT_BUNDLE_ID,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await importPrivateKey(env.APPLE_IAP_KEY!);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64urlBytes2(new Uint8Array(sig))}`;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

function b64url(s: string): string {
  return b64urlBytes2(new TextEncoder().encode(s));
}
function b64urlBytes2(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlBytes(b64u: string): Uint8Array {
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64u.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
