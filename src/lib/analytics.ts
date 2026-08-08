/**
 * Privacy-first first-party analytics for CladFacts.
 *
 * Design principles (aligned with Plausible / Fathom / Simple Analytics):
 * - No cookies, no fingerprinting, no user ids / emails / names
 * - No raw IP storage; no full user-agent strings
 * - Paths only (strip query/hash); referrer host only
 * - Aggregate daily rollups; session uniqueness via salted daily hash
 * - Respect DNT / GPC; skip bots, admin, and prerender
 */

export type DeviceClass = "mobile" | "tablet" | "desktop" | "bot" | "unknown";

export interface CollectPayload {
  e: "pageview" | "engage" | "video";
  p?: string;
  r?: string;
  s?: string;
  /** Engaged seconds for this heartbeat (engage) or cumulative watch (video) */
  d?: number;
  /** Video id (11-char YouTube) */
  v?: string;
  /** Video milestone reached: play | 15 | 30 | 60 | 120 | 300 */
  m?: string;
}

export interface AnalyticsSummary {
  rangeDays: number;
  from: string;
  to: string;
  pageviews: number;
  sessions: number;
  avgEngagedSeconds: number;
  topPages: { path: string; pageviews: number; sessions: number; avgSeconds: number }[];
  topReferrers: { host: string; hits: number }[];
  devices: { device: string; hits: number; pct: number }[];
  countries: { country: string; hits: number }[];
  hours: { hour: number; pageviews: number }[];
  videos: {
    videoId: string;
    path: string;
    plays: number;
    watchSeconds: number;
    avgWatch: number;
    m15: number;
    m30: number;
    m60: number;
  }[];
  recommendations: Recommendation[];
  privacyNote: string;
}

export interface Recommendation {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  basedOn: string;
}

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS analytics_daily (
    day TEXT NOT NULL, path TEXT NOT NULL,
    pageviews INTEGER NOT NULL DEFAULT 0,
    sessions INTEGER NOT NULL DEFAULT 0,
    engaged_seconds INTEGER NOT NULL DEFAULT 0,
    engages INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, path)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_daily_day ON analytics_daily(day)`,
  `CREATE TABLE IF NOT EXISTS analytics_referrers_daily (
    day TEXT NOT NULL, host TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, host)
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_devices_daily (
    day TEXT NOT NULL, device TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, device)
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_countries_daily (
    day TEXT NOT NULL, country TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, country)
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_hours_daily (
    day TEXT NOT NULL, hour INTEGER NOT NULL, pageviews INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, hour)
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_video_daily (
    day TEXT NOT NULL, video_id TEXT NOT NULL, path TEXT NOT NULL,
    plays INTEGER NOT NULL DEFAULT 0, watch_seconds INTEGER NOT NULL DEFAULT 0,
    milestone_15 INTEGER NOT NULL DEFAULT 0, milestone_30 INTEGER NOT NULL DEFAULT 0,
    milestone_60 INTEGER NOT NULL DEFAULT 0, milestone_120 INTEGER NOT NULL DEFAULT 0,
    milestone_300 INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, video_id, path)
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_session_day (
    day TEXT NOT NULL, session_hash TEXT NOT NULL,
    PRIMARY KEY (day, session_hash)
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_meta (
    key TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL
  )`,
];

let schemaReady: Promise<void> | null = null;

export async function ensureAnalyticsSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const sql of SCHEMA_SQL) {
        try {
          await db.prepare(sql).run();
        } catch {
          // ignore race / already exists
        }
      }
      try {
        await db
          .prepare(
            `INSERT INTO analytics_meta (key, value) VALUES ('schema', '1')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`
          )
          .run();
      } catch {
        /* ok */
      }
    })();
  }
  await schemaReady;
}

/** Normalize path: no query/hash, trailing slash (except root file paths). */
export function normalizePath(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  let p = raw.trim();
  if (p.length > 300) return null;
  // Drop origin if absolute
  try {
    if (p.startsWith("http://") || p.startsWith("https://")) {
      const u = new URL(p);
      p = u.pathname;
    }
  } catch {
    return null;
  }
  p = p.split("?")[0]!.split("#")[0]!;
  if (!p.startsWith("/")) p = "/" + p;
  // Block sensitive / non-content paths
  if (
    p.startsWith("/admin") ||
    p.startsWith("/api/") ||
    p.startsWith("/account") ||
    p.startsWith("/login") ||
    p.startsWith("/register") ||
    p.startsWith("/reset-password") ||
    p.startsWith("/.well-known") ||
    p.includes("..")
  ) {
    return null;
  }
  // Normalize trailing slash like site policy
  if (p.length > 1 && !p.endsWith("/") && !/\.[a-z0-9]+$/i.test(p)) p += "/";
  // Collapse //
  p = p.replace(/\/{2,}/g, "/");
  return p;
}

export function referrerHost(raw: string | undefined | null): string {
  if (!raw || typeof raw !== "string") return "direct";
  try {
    const u = new URL(raw);
    let h = u.hostname.replace(/^www\./, "").toLowerCase();
    if (!h || h === "cladfacts.com" || h.endsWith(".cladfacts.com")) return "direct";
    if (h.length > 120) h = h.slice(0, 120);
    return h || "direct";
  } catch {
    return "direct";
  }
}

export function deviceFromUA(ua: string | null): DeviceClass {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  if (
    /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|wget|curl|python-requests|scrapy/i.test(
      s
    )
  ) {
    return "bot";
  }
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(s)) return "mobile";
  return "desktop";
}

export function isBotUA(ua: string | null): boolean {
  return deviceFromUA(ua) === "bot";
}

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function utcHour(d = new Date()): number {
  return d.getUTCHours();
}

async function hashSession(day: string, sessionId: string): Promise<string> {
  // Daily salt so hashes rotate and cannot link sessions across days.
  const material = `clad-analytics|${day}|${sessionId}`;
  const data = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 16; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
  return hex;
}

function countryFromRequest(request: Request): string {
  const c =
    request.headers.get("cf-ipcountry") ||
    request.headers.get("CF-IPCountry") ||
    "XX";
  const up = c.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  if (!up || up === "T1") return "XX"; // Tor / unknown
  return up;
}

export async function ingestEvent(
  db: D1Database,
  request: Request,
  body: CollectPayload
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  await ensureAnalyticsSchema(db);

  const ua = request.headers.get("user-agent");
  if (isBotUA(ua)) return { ok: true }; // drop quietly

  // Global Privacy Control / DNT — honor opt-out
  const gpc = request.headers.get("sec-gpc");
  const dnt = request.headers.get("dnt");
  if (gpc === "1" || dnt === "1") return { ok: true };

  const purpose = (request.headers.get("sec-purpose") || request.headers.get("purpose") || "").toLowerCase();
  if (purpose.includes("prefetch") || purpose.includes("prerender")) return { ok: true };

  const type = body?.e;
  if (type !== "pageview" && type !== "engage" && type !== "video") {
    return { ok: false, error: "bad event", status: 400 };
  }

  const path = normalizePath(body.p);
  if (!path) return { ok: false, error: "bad path", status: 400 };

  const day = utcDay();
  const hour = utcHour();
  const device = deviceFromUA(ua);
  if (device === "bot") return { ok: true };

  const country = countryFromRequest(request);
  const sid = typeof body.s === "string" ? body.s.trim().slice(0, 64) : "";

  try {
    if (type === "pageview") {
      const ref = referrerHost(body.r);
      let isNewSession = false;
      if (sid && /^[a-zA-Z0-9_-]{8,64}$/.test(sid)) {
        const sh = await hashSession(day, sid);
        try {
          const ins = await db
            .prepare(
              `INSERT OR IGNORE INTO analytics_session_day (day, session_hash) VALUES (?, ?)`
            )
            .bind(day, sh)
            .run();
          // D1 changes: 1 if inserted
          isNewSession = (ins.meta?.changes ?? 0) > 0;
        } catch {
          isNewSession = false;
        }
      }

      const stmts = [
        db
          .prepare(
            `INSERT INTO analytics_daily (day, path, pageviews, sessions, engaged_seconds, engages)
             VALUES (?, ?, 1, ?, 0, 0)
             ON CONFLICT(day, path) DO UPDATE SET
               pageviews = pageviews + 1,
               sessions = sessions + excluded.sessions`
          )
          .bind(day, path, isNewSession ? 1 : 0),
        db
          .prepare(
            `INSERT INTO analytics_hours_daily (day, hour, pageviews) VALUES (?, ?, 1)
             ON CONFLICT(day, hour) DO UPDATE SET pageviews = pageviews + 1`
          )
          .bind(day, hour),
        db
          .prepare(
            `INSERT INTO analytics_devices_daily (day, device, hits) VALUES (?, ?, 1)
             ON CONFLICT(day, device) DO UPDATE SET hits = hits + 1`
          )
          .bind(day, device),
        db
          .prepare(
            `INSERT INTO analytics_countries_daily (day, country, hits) VALUES (?, ?, 1)
             ON CONFLICT(day, country) DO UPDATE SET hits = hits + 1`
          )
          .bind(day, country),
        db
          .prepare(
            `INSERT INTO analytics_referrers_daily (day, host, hits) VALUES (?, ?, 1)
             ON CONFLICT(day, host) DO UPDATE SET hits = hits + 1`
          )
          .bind(day, ref),
      ];
      await db.batch(stmts);
      return { ok: true };
    }

    if (type === "engage") {
      const secs = Math.max(0, Math.min(120, Math.floor(Number(body.d) || 0)));
      if (secs < 1) return { ok: true };
      await db
        .prepare(
          `INSERT INTO analytics_daily (day, path, pageviews, sessions, engaged_seconds, engages)
           VALUES (?, ?, 0, 0, ?, 1)
           ON CONFLICT(day, path) DO UPDATE SET
             engaged_seconds = engaged_seconds + excluded.engaged_seconds,
             engages = engages + 1`
        )
        .bind(day, path, secs)
        .run();
      return { ok: true };
    }

    // video
    const videoId = typeof body.v === "string" ? body.v.trim() : "";
    if (!/^[\w-]{11}$/.test(videoId)) {
      return { ok: false, error: "bad video", status: 400 };
    }
    const milestone = String(body.m || "play").toLowerCase();
    const allowed = new Set(["play", "15", "30", "60", "120", "300"]);
    if (!allowed.has(milestone)) return { ok: false, error: "bad milestone", status: 400 };

    const watchDelta = Math.max(0, Math.min(60, Math.floor(Number(body.d) || 0)));

    const cols: Record<string, string> = {
      play: "plays",
      "15": "milestone_15",
      "30": "milestone_30",
      "60": "milestone_60",
      "120": "milestone_120",
      "300": "milestone_300",
    };
    const col = cols[milestone]!;

    if (milestone === "play") {
      await db
        .prepare(
          `INSERT INTO analytics_video_daily (day, video_id, path, plays, watch_seconds)
           VALUES (?, ?, ?, 1, 0)
           ON CONFLICT(day, video_id, path) DO UPDATE SET plays = plays + 1`
        )
        .bind(day, videoId, path)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO analytics_video_daily (day, video_id, path, plays, watch_seconds, ${col})
           VALUES (?, ?, ?, 0, ?, 1)
           ON CONFLICT(day, video_id, path) DO UPDATE SET
             ${col} = ${col} + 1,
             watch_seconds = watch_seconds + excluded.watch_seconds`
        )
        .bind(day, videoId, path, watchDelta)
        .run();
    }

    // Heartbeat-only watch seconds without milestone
    if (milestone !== "play" && watchDelta > 0) {
      // already added in the update above for milestones; for pure heartbeats use m=play with d?
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "db error", status: 502 };
  }
}

/** Optional: drop session hashes older than N days (call from admin or cron). */
export async function purgeOldSessions(db: D1Database, keepDays = 14): Promise<void> {
  await ensureAnalyticsSchema(db);
  const cut = new Date(Date.now() - keepDays * 86_400_000).toISOString().slice(0, 10);
  await db.prepare(`DELETE FROM analytics_session_day WHERE day < ?`).bind(cut).run();
}

export async function buildAnalyticsSummary(
  db: D1Database,
  rangeDays = 7
): Promise<AnalyticsSummary> {
  await ensureAnalyticsSchema(db);
  const days = Math.min(90, Math.max(1, rangeDays));
  const to = utcDay();
  const fromDate = new Date(Date.now() - (days - 1) * 86_400_000);
  const from = fromDate.toISOString().slice(0, 10);

  const totals = await db
    .prepare(
      `SELECT
         COALESCE(SUM(pageviews),0) AS pageviews,
         COALESCE(SUM(sessions),0) AS sessions,
         COALESCE(SUM(engaged_seconds),0) AS engaged_seconds
       FROM analytics_daily WHERE day >= ? AND day <= ?`
    )
    .bind(from, to)
    .first<{ pageviews: number; sessions: number; engaged_seconds: number }>();

  const pageviews = Number(totals?.pageviews ?? 0);
  const sessions = Number(totals?.sessions ?? 0);
  const engaged = Number(totals?.engaged_seconds ?? 0);
  const avgEngagedSeconds =
    pageviews > 0 ? Math.round((engaged / pageviews) * 10) / 10 : 0;

  const pageRows = await db
    .prepare(
      `SELECT path,
         SUM(pageviews) AS pageviews,
         SUM(sessions) AS sessions,
         SUM(engaged_seconds) AS engaged_seconds
       FROM analytics_daily
       WHERE day >= ? AND day <= ?
       GROUP BY path
       ORDER BY pageviews DESC
       LIMIT 40`
    )
    .bind(from, to)
    .all<{ path: string; pageviews: number; sessions: number; engaged_seconds: number }>();

  const topPages = (pageRows.results ?? []).map((r) => ({
    path: r.path,
    pageviews: Number(r.pageviews),
    sessions: Number(r.sessions),
    avgSeconds:
      Number(r.pageviews) > 0
        ? Math.round((Number(r.engaged_seconds) / Number(r.pageviews)) * 10) / 10
        : 0,
  }));

  const refRows = await db
    .prepare(
      `SELECT host, SUM(hits) AS hits FROM analytics_referrers_daily
       WHERE day >= ? AND day <= ?
       GROUP BY host ORDER BY hits DESC LIMIT 20`
    )
    .bind(from, to)
    .all<{ host: string; hits: number }>();

  const topReferrers = (refRows.results ?? []).map((r) => ({
    host: r.host,
    hits: Number(r.hits),
  }));

  const devRows = await db
    .prepare(
      `SELECT device, SUM(hits) AS hits FROM analytics_devices_daily
       WHERE day >= ? AND day <= ?
       GROUP BY device ORDER BY hits DESC`
    )
    .bind(from, to)
    .all<{ device: string; hits: number }>();

  const devTotal = (devRows.results ?? []).reduce((a, r) => a + Number(r.hits), 0) || 1;
  const devices = (devRows.results ?? []).map((r) => ({
    device: r.device,
    hits: Number(r.hits),
    pct: Math.round((Number(r.hits) / devTotal) * 1000) / 10,
  }));

  const ctyRows = await db
    .prepare(
      `SELECT country, SUM(hits) AS hits FROM analytics_countries_daily
       WHERE day >= ? AND day <= ?
       GROUP BY country ORDER BY hits DESC LIMIT 15`
    )
    .bind(from, to)
    .all<{ country: string; hits: number }>();

  const countries = (ctyRows.results ?? []).map((r) => ({
    country: r.country,
    hits: Number(r.hits),
  }));

  const hourRows = await db
    .prepare(
      `SELECT hour, SUM(pageviews) AS pageviews FROM analytics_hours_daily
       WHERE day >= ? AND day <= ?
       GROUP BY hour ORDER BY hour ASC`
    )
    .bind(from, to)
    .all<{ hour: number; pageviews: number }>();

  const hourMap = new Map<number, number>();
  for (const r of hourRows.results ?? []) hourMap.set(Number(r.hour), Number(r.pageviews));
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    pageviews: hourMap.get(h) ?? 0,
  }));

  const vidRows = await db
    .prepare(
      `SELECT video_id, path,
         SUM(plays) AS plays,
         SUM(watch_seconds) AS watch_seconds,
         SUM(milestone_15) AS m15,
         SUM(milestone_30) AS m30,
         SUM(milestone_60) AS m60
       FROM analytics_video_daily
       WHERE day >= ? AND day <= ?
       GROUP BY video_id, path
       ORDER BY plays DESC
       LIMIT 25`
    )
    .bind(from, to)
    .all<{
      video_id: string;
      path: string;
      plays: number;
      watch_seconds: number;
      m15: number;
      m30: number;
      m60: number;
    }>();

  const videos = (vidRows.results ?? []).map((r) => {
    const plays = Number(r.plays) || 0;
    const watch = Number(r.watch_seconds) || 0;
    return {
      videoId: r.video_id,
      path: r.path,
      plays,
      watchSeconds: watch,
      avgWatch: plays > 0 ? Math.round(watch / plays) : 0,
      m15: Number(r.m15) || 0,
      m30: Number(r.m30) || 0,
      m60: Number(r.m60) || 0,
    };
  });

  const recommendations = buildRecommendations({
    pageviews,
    sessions,
    avgEngagedSeconds,
    topPages,
    topReferrers,
    devices,
    hours,
    videos,
    rangeDays: days,
  });

  return {
    rangeDays: days,
    from,
    to,
    pageviews,
    sessions,
    avgEngagedSeconds,
    topPages,
    topReferrers,
    devices,
    countries,
    hours,
    videos,
    recommendations,
    privacyNote:
      "First-party, cookieless aggregates only. No user accounts, emails, names, raw IPs, or full user-agents are stored. Session uniqueness uses a daily-rotating hash. DNT/GPC opt-outs are honored.",
  };
}

function buildRecommendations(input: {
  pageviews: number;
  sessions: number;
  avgEngagedSeconds: number;
  topPages: AnalyticsSummary["topPages"];
  topReferrers: AnalyticsSummary["topReferrers"];
  devices: AnalyticsSummary["devices"];
  hours: AnalyticsSummary["hours"];
  videos: AnalyticsSummary["videos"];
  rangeDays: number;
}): Recommendation[] {
  const out: Recommendation[] = [];
  const {
    pageviews,
    sessions,
    avgEngagedSeconds,
    topPages,
    topReferrers,
    devices,
    hours,
    videos,
    rangeDays,
  } = input;

  if (pageviews < 20) {
    out.push({
      id: "cold-start",
      priority: "low",
      title: "Still collecting a baseline",
      detail:
        "Recommendations get sharper after ~100+ pageviews. Keep the tracker live; review again in a few days. Share top report cards and the homepage on channels your 16–24 audience already uses.",
      basedOn: `${pageviews} pageviews in ${rangeDays}d`,
    });
    return out;
  }

  // Low engagement time
  if (avgEngagedSeconds > 0 && avgEngagedSeconds < 20) {
    out.push({
      id: "low-time",
      priority: "high",
      title: "Readers leave quickly on average",
      detail:
        "Average engaged time is under 20s. Strengthen above-the-fold clarity on the homepage and report cards: one-sentence takeaway, visible grade story, and a clear next report to open. Trim chrome that delays the first fact.",
      basedOn: `avg engaged ${avgEngagedSeconds}s / pageview`,
    });
  } else if (avgEngagedSeconds >= 45) {
    out.push({
      id: "strong-time",
      priority: "low",
      title: "Engagement time looks healthy",
      detail:
        "Readers are spending meaningful time on pages. Double down on formats that work (long report cards, discover packs) and surface similar content on the homepage.",
      basedOn: `avg engaged ${avgEngagedSeconds}s / pageview`,
    });
  }

  // Pages with high views but very low time
  const shallow = topPages
    .filter((p) => p.pageviews >= 10 && p.avgSeconds > 0 && p.avgSeconds < 12)
    .slice(0, 5);
  if (shallow.length) {
    out.push({
      id: "shallow-pages",
      priority: "high",
      title: "High-traffic pages with shallow reads",
      detail:
        `These paths get visits but little dwell time: ${shallow.map((p) => p.path).join(", ")}. Improve headlines, open with the graded claim, and add internal links to related reports so readers continue.`,
      basedOn: shallow.map((p) => `${p.path} (${p.avgSeconds}s)`).join("; "),
    });
  }

  // Pages with strong time — promote
  const deep = topPages
    .filter((p) => p.pageviews >= 5 && p.avgSeconds >= 60)
    .slice(0, 5);
  if (deep.length) {
    out.push({
      id: "deep-pages",
      priority: "medium",
      title: "Promote deep-engagement content",
      detail:
        `Readers linger on: ${deep.map((p) => p.path).join(", ")}. Feature these more prominently in homepage modules, email, and “related” blocks.`,
      basedOn: deep.map((p) => `${p.path} (~${p.avgSeconds}s)`).join("; "),
    });
  }

  // Homepage vs reports mix
  const home = topPages.find((p) => p.path === "/");
  const postViews = topPages
    .filter((p) => p.path.startsWith("/posts/"))
    .reduce((a, p) => a + p.pageviews, 0);
  if (home && home.pageviews > 0 && postViews / Math.max(home.pageviews, 1) < 0.4 && home.pageviews >= 30) {
    out.push({
      id: "home-to-post",
      priority: "medium",
      title: "Homepage isn’t converting into report reads",
      detail:
        "Many visits hit home without continuing into /posts/. Make the first three cards more scannable for teens/college readers, tighten CTAs (“See the grade”), and test a single hero report.",
      basedOn: `home ${home.pageviews} pv vs posts ${postViews} pv`,
    });
  }

  // Video play-through
  const postPageViews = postViews || 1;
  const totalPlays = videos.reduce((a, v) => a + v.plays, 0);
  if (postPageViews >= 20 && totalPlays / postPageViews < 0.15) {
    out.push({
      id: "video-plays",
      priority: "medium",
      title: "Few readers start the source video",
      detail:
        "Play rate on report pages is low. Ensure the video facade is above the fold on mobile, use a clear “Play source video” label, and open with a still that telegraphs the topic—not a generic freeze-frame.",
      basedOn: `${totalPlays} plays / ~${postPageViews} post pageviews`,
    });
  }

  const dropOff = videos.filter((v) => v.plays >= 5 && v.m30 / v.plays < 0.25);
  if (dropOff.length) {
    out.push({
      id: "video-dropoff",
      priority: "medium",
      title: "Videos lose most viewers before 30s",
      detail:
        "Estimated watch time drops quickly. Prefer shorter source clips when possible, or lead the written grade so readers who skip video still get value. Consider chapter-style summary bullets next to the player.",
      basedOn: dropOff
        .slice(0, 3)
        .map((v) => `${v.videoId} (${v.m30}/${v.plays} hit 30s)`)
        .join("; "),
    });
  }

  // Devices
  const mobile = devices.find((d) => d.device === "mobile");
  if (mobile && mobile.pct >= 55) {
    out.push({
      id: "mobile-first",
      priority: "high",
      title: "Audience is mobile-first — design for the phone",
      detail:
        "Over half of pageviews are mobile. Prioritize thumb-reach nav, larger grade badges, faster LCP on report cards, and single-column modules. Re-test markups and paywall prompts on a small phone.",
      basedOn: `${mobile.pct}% mobile pageviews`,
    });
  }

  // Peak hours (UTC)
  const peak = [...hours].sort((a, b) => b.pageviews - a.pageviews)[0];
  if (peak && peak.pageviews > 0) {
    out.push({
      id: "peak-hours",
      priority: "low",
      title: "Schedule publishes around peak traffic",
      detail: `Strongest UTC hour is ${String(peak.hour).padStart(2, "0")}:00 (${peak.pageviews} pageviews in range). Align breaking grades and newsletter sends near audience peaks (adjust for US student evenings in local time).`,
      basedOn: `hour ${peak.hour} UTC`,
    });
  }

  // Referrers
  const external = topReferrers.filter((r) => r.host !== "direct");
  if (external.length === 0 && pageviews >= 50) {
    out.push({
      id: "no-referrers",
      priority: "medium",
      title: "Almost no external referrers yet",
      detail:
        "Traffic looks mostly direct/typed. Invest in share cards, campus clubs, teacher resources (/students/), and one distribution channel (e.g. short clips linking to graded reports).",
      basedOn: "referrer mix",
    });
  } else if (external[0] && external[0].hits / Math.max(pageviews, 1) > 0.25) {
    out.push({
      id: "top-referrer",
      priority: "low",
      title: `Lean into ${external[0].host}`,
      detail: `A large share of referred traffic comes from ${external[0].host}. Keep OG images sharp, headlines honest (no clickbait), and landing pages fast for that audience.`,
      basedOn: `${external[0].hits} hits from ${external[0].host}`,
    });
  }

  // Sessions vs pageviews (pages per session proxy)
  if (sessions > 0 && pageviews / sessions < 1.3 && sessions >= 30) {
    out.push({
      id: "single-page",
      priority: "medium",
      title: "Most visits look like single-page sessions",
      detail:
        "Pages-per-session is low. Add stronger “Next up” and topic rails on report cards, and a sticky “More grades” path back to Discover for the student audience.",
      basedOn: `${pageviews} pv / ${sessions} sessions`,
    });
  }

  // Sort by priority
  const order = { high: 0, medium: 1, low: 2 };
  out.sort((a, b) => order[a.priority] - order[b.priority]);
  return out.slice(0, 10);
}
