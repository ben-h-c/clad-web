import { env } from "cloudflare:workers";
import {
  PUSH_DAILY_CAPS,
  calendarPushCopy,
  classifyReportPush,
  digestPushCopy,
  isQuietHoursNy,
  pushDayKeyNy,
  reportPushCopy,
  type InterruptionLevel,
  type ReportPushMeta,
  type ReportPushTier,
} from "./pushPolicy.ts";

/**
 * APNs (Apple Push Notification service) from the Worker, using token-based
 * auth: an ES256 JWT signed with the .p8 auth key.
 *
 * Editorial policy (see pushPolicy.ts): only high-signal alerts reach the
 * lock screen; routine grades go to a quiet evening digest or nowhere.
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

export type PushKind = "report" | "event" | "digest" | "test";

export interface PushPayload {
  title: string;
  body: string;
  /** Deep-link path on cladfacts.com, e.g. /posts/slug/ or / (calendar). */
  path: string;
  kind: PushKind;
  /** Optional post slug for legacy iOS payloads. */
  slug?: string;
  interruption?: InterruptionLevel;
  /** 0..1 — Notification Summary ranking. */
  relevanceScore?: number;
  /** Play sound only for true highlights. */
  sound?: boolean;
  /** APNs collapse-id (max 64). */
  collapseId?: string;
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
  reason?: string;
  tier?: string;
}

// ---------------------------------------------------------------------------
// Public editorial entry points
// ---------------------------------------------------------------------------

/**
 * Publish-time fan-out. Most reports return skipped — only notable / highlight
 * grades interrupt, subject to daily fleet caps and quiet hours.
 */
export async function maybeSendReportPush(
  meta: ReportPushMeta & { slug: string }
): Promise<PushSendResult> {
  const tier = classifyReportPush(meta);
  if (tier === "skip") {
    await queueDigestHeadline(meta.headline, meta.slug);
    return {
      sent: 0,
      failed: 0,
      pruned: 0,
      skipped: 0,
      recipients: 0,
      reason: "not_newsworthy_for_push",
      tier,
    };
  }

  // Quiet hours: highlights only; queue notables for the evening digest.
  if (isQuietHoursNy() && tier === "notable") {
    await queueDigestHeadline(meta.headline, meta.slug);
    return {
      sent: 0,
      failed: 0,
      pruned: 0,
      skipped: 0,
      recipients: 0,
      reason: "quiet_hours",
      tier,
    };
  }

  const day = pushDayKeyNy();
  const budget = await takeReportPushSlot(day, tier);
  if (!budget.ok) {
    await queueDigestHeadline(meta.headline, meta.slug);
    return {
      sent: 0,
      failed: 0,
      pruned: 0,
      skipped: 0,
      recipients: 0,
      reason: budget.reason,
      tier,
    };
  }

  const copy = reportPushCopy(tier, meta);
  const result = await sendPush({
    title: copy.title,
    body: copy.body,
    path: `/posts/${meta.slug}/`,
    kind: "report",
    slug: meta.slug,
    interruption: copy.interruption,
    relevanceScore: copy.relevance,
    sound: copy.sound,
    collapseId: `report-${meta.slug}`.slice(0, 64),
  });
  return { ...result, tier };
}

/** @deprecated Prefer maybeSendReportPush — kept for admin/scripts. */
export async function sendBreakingPush(input: {
  title: string;
  body: string;
  slug: string;
}): Promise<PushSendResult> {
  return maybeSendReportPush({
    headline: input.body || input.title,
    slug: input.slug,
    featured: true, // force highlight path for explicit callers
  });
}

/** Calendar daybook — marquee items only; one fleet push per NY day. */
export async function sendEventPush(input: {
  mode: "today" | "tomorrow";
  titles: string[];
  path?: string;
}): Promise<PushSendResult> {
  const copy = calendarPushCopy(input.mode, input.titles);
  if (!copy) {
    return {
      sent: 0,
      failed: 0,
      pruned: 0,
      skipped: 0,
      recipients: 0,
      reason: "no_marquee_events",
    };
  }

  const day = pushDayKeyNy();
  const calKey = `push:budget:calendar:${day}`;
  if (!(await claimDailySlot(calKey, PUSH_DAILY_CAPS.calendar))) {
    return {
      sent: 0,
      failed: 0,
      pruned: 0,
      skipped: 0,
      recipients: 0,
      reason: "daily_calendar_cap",
    };
  }

  // Skip pure quiet-hour calendar pings (evening tomorrow still allowed passive).
  if (isQuietHoursNy() && input.mode === "today") {
    return {
      sent: 0,
      failed: 0,
      pruned: 0,
      skipped: 0,
      recipients: 0,
      reason: "quiet_hours",
    };
  }

  return sendPush({
    title: copy.title,
    body: copy.body,
    path: input.path || "/",
    kind: "event",
    interruption: copy.interruption,
    relevanceScore: copy.relevance,
    sound: copy.sound,
    collapseId: `event-${input.mode}-${day}`.slice(0, 64),
  });
}

/**
 * Evening desk digest — passive NC entry summarizing grades that didn't
 * earn an immediate lock-screen alert. Call once per evening (push-reminders).
 */
export async function sendPendingDigestPush(): Promise<PushSendResult> {
  const day = pushDayKeyNy();
  const key = `push:digest-queue:${day}`;
  const raw = await env.AGENTS.get(key);
  if (!raw) {
    return {
      sent: 0,
      failed: 0,
      pruned: 0,
      skipped: 0,
      recipients: 0,
      reason: "empty_digest",
    };
  }

  let items: { headline: string; slug: string }[] = [];
  try {
    items = JSON.parse(raw) as { headline: string; slug: string }[];
  } catch {
    return {
      sent: 0,
      failed: 0,
      pruned: 0,
      skipped: 0,
      recipients: 0,
      reason: "bad_digest_json",
    };
  }
  if (!items.length) {
    return {
      sent: 0,
      failed: 0,
      pruned: 0,
      skipped: 0,
      recipients: 0,
      reason: "empty_digest",
    };
  }

  // Don't double-send digest the same day.
  const sentKey = `push:digest-sent:${day}`;
  if (await env.AGENTS.get(sentKey)) {
    return {
      sent: 0,
      failed: 0,
      pruned: 0,
      skipped: 0,
      recipients: 0,
      reason: "digest_already_sent",
    };
  }

  const headlines = items.map((i) => i.headline).filter(Boolean);
  const copy = digestPushCopy(headlines, items.length);
  // Deep-link to newest skipped report if unique, else home.
  const path =
    items.length === 1 && items[0]?.slug
      ? `/posts/${items[0].slug}/`
      : "/";

  const result = await sendPush({
    title: copy.title,
    body: copy.body,
    path,
    kind: "digest",
    slug: items[0]?.slug,
    interruption: copy.interruption,
    relevanceScore: copy.relevance,
    sound: false,
    collapseId: `digest-${day}`.slice(0, 64),
  });

  if (result.sent > 0) {
    await env.AGENTS.put(sentKey, new Date().toISOString(), {
      expirationTtl: 60 * 60 * 36,
    });
    await env.AGENTS.delete(key);
  }
  return { ...result, reason: "digest", tier: "digest" };
}

// ---------------------------------------------------------------------------
// Core send
// ---------------------------------------------------------------------------

/**
 * Send a notification. Best-effort: individual failures are swallowed;
 * 410/BadDeviceToken prune dead rows. Anonymous tokens always receive;
 * signed-in tokens honor pushReports / pushEvents prefs (default on).
 */
export async function sendPush(payload: PushPayload): Promise<PushSendResult> {
  if (!(await apnsConfigured())) {
    return { sent: 0, failed: 0, pruned: 0, skipped: 0, recipients: 0, reason: "apns_unconfigured" };
  }

  const rows = await env.DB.prepare(
    "SELECT token, environment, userId FROM push_token"
  ).all<PushTokenRow>();
  let all = rows.results ?? [];

  // Prefs filter for signed-in devices.
  if (payload.kind === "report" || payload.kind === "event" || payload.kind === "digest") {
    // Digest uses pushReports (desk product); events use pushEvents.
    const prefKey =
      payload.kind === "event" ? "pushEvents" : "pushReports";
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
    return { sent: 0, failed: 0, pruned: 0, skipped, recipients: 0, reason: "no_recipients" };
  }

  const bundleId = env.APNS_BUNDLE_ID || DEFAULT_BUNDLE_ID;
  const jwt = await makeProviderToken();
  const path = payload.path.startsWith("/") ? payload.path : `/${payload.path}`;
  const absoluteUrl = `https://cladfacts.com${path}`;
  const interruption = payload.interruption || "active";
  const relevance =
    typeof payload.relevanceScore === "number"
      ? Math.max(0, Math.min(1, payload.relevanceScore))
      : 0.5;
  // Priority 5 = power-efficient; 10 = immediate. Passive + passive → 5.
  const priority =
    interruption === "passive" || payload.kind === "digest" ? "5" : "10";

  const aps: Record<string, unknown> = {
    alert: { title: payload.title, body: payload.body },
    "thread-id": payload.kind === "digest" ? "report" : payload.kind,
    "interruption-level": interruption,
    "relevance-score": relevance,
  };
  if (payload.sound !== false && interruption !== "passive" && payload.kind !== "digest") {
    if (payload.sound) aps.sound = "default";
  }

  const apsBody = JSON.stringify({
    aps,
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
            "apns-priority": priority,
            "apns-collapse-id": (payload.collapseId || payload.kind).slice(0, 64),
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

// ---------------------------------------------------------------------------
// Budget / digest queue (KV)
// ---------------------------------------------------------------------------

async function takeReportPushSlot(
  day: string,
  tier: ReportPushTier
): Promise<{ ok: boolean; reason?: string }> {
  const totalKey = `push:budget:report:${day}`;
  const hiKey = `push:budget:highlight:${day}`;

  if (tier === "highlight") {
    if (!(await claimDailySlot(hiKey, PUSH_DAILY_CAPS.highlights))) {
      return { ok: false, reason: "daily_highlight_cap" };
    }
  }
  if (!(await claimDailySlot(totalKey, PUSH_DAILY_CAPS.reportAlerts))) {
    return { ok: false, reason: "daily_report_cap" };
  }
  return { ok: true };
}

/** Atomic-ish increment under a daily cap (KV get/put; fine at our volume). */
async function claimDailySlot(key: string, cap: number): Promise<boolean> {
  const raw = await env.AGENTS.get(key);
  const n = raw ? parseInt(raw, 10) || 0 : 0;
  if (n >= cap) return false;
  await env.AGENTS.put(key, String(n + 1), { expirationTtl: 60 * 60 * 40 });
  return true;
}

async function queueDigestHeadline(headline: string, slug: string): Promise<void> {
  const day = pushDayKeyNy();
  const key = `push:digest-queue:${day}`;
  let items: { headline: string; slug: string }[] = [];
  try {
    const raw = await env.AGENTS.get(key);
    if (raw) items = JSON.parse(raw) as { headline: string; slug: string }[];
  } catch {
    items = [];
  }
  // Newest first; de-dupe by slug; keep a short list for the evening copy.
  items = [{ headline: String(headline).slice(0, 120), slug }, ...items.filter((i) => i.slug !== slug)].slice(
    0,
    12
  );
  await env.AGENTS.put(key, JSON.stringify(items), { expirationTtl: 60 * 60 * 40 });
}

/** userIds who explicitly opted out of a push kind (prefs key === false). */
async function loadPushOptOuts(userIds: string[], prefKey: string): Promise<Set<string>> {
  const unique = [...new Set(userIds)].slice(0, 500);
  if (!unique.length) return new Set();
  const out = new Set<string>();
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
        if (p[prefKey] === false) out.add(row.userId);
      } catch {
        /* ignore */
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
