/**
 * Aggregate counts/flags for the admin dashboard.
 * Best-effort: individual sources fail soft so the page still renders.
 */
import { getCollection } from "astro:content";
import {
  getRegistry,
  getUrlQueue,
  listDrafts,
  openFlagCount,
  type Agent,
} from "./agents.ts";

export type DashTone = "ok" | "warn" | "bad" | "neutral";

export interface DashTile {
  key: string;
  label: string;
  value: string | number;
  detail: string;
  tone: DashTone;
  href: string;
}

export interface AdminDashboard {
  tiles: DashTile[];
  failingAgents: { id: string; name: string; message: string; at: string | null }[];
  staleAgents: { id: string; name: string; hoursAgo: number }[];
  recentUsers: { id: string; name: string; email: string; createdAt: string }[];
  generatedAt: string;
}

function hoursSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

function agentExpectedHours(a: Agent): number {
  // Align with economy minHoursBetweenRuns (default mode) so the dashboard
  // doesn't flag agents as "stale" while the spend dial intentionally stretches them.
  const econMin: Record<string, number> = {
    "youtube-scanner": 2,
    "politician-profile-builder": 6,
    "politician-grader": 12,
    "social-sentiment-scanner": 24,
    "calendar-scanner": 12,
    "home-layout-curator": 12,
    "forecast-refresher": 24,
    "today-in-history": 24,
    "human-spotlight": 24,
    "discover-curator": 24,
    "good-news-curator": 24,
    "race-board-auditor": 24,
    "frontpage-curator": 4,
    "breaking-news-curator": 0.75,
    "quip-writer": 72,
    "share-tag-writer": 72,
    "compliance-auditor": 168,
  };
  const minH = econMin[a.kind];
  if (minH != null) {
    // Warn after ~2× economy spacing (min 2h for frequent agents, cap 96h).
    return Math.min(96, Math.max(2, minH * 2.5));
  }
  // Fallback: cron-based estimate
  const cron = a.cron || "";
  if (cron.startsWith("*/15")) return 2;
  if (cron.startsWith("*/60") || cron === "0 * * * *") return 4;
  if (cron.includes("*/3") || cron.includes("*/4")) return 12;
  if (cron.includes("* * *") && cron.split(/\s+/).length === 5) {
    if (cron.endsWith("* *") || /^\d+ \d+ \* \* \*$/.test(cron)) return 36;
  }
  return 48;
}

export async function buildAdminDashboard(env: {
  AGENTS: KVNamespace;
  DB: D1Database;
}): Promise<AdminDashboard> {
  const tiles: DashTile[] = [];
  const failingAgents: AdminDashboard["failingAgents"] = [];
  const staleAgents: AdminDashboard["staleAgents"] = [];
  let recentUsers: AdminDashboard["recentUsers"] = [];

  // --- Pending drafts ---
  let pending = 0;
  try {
    pending = (await listDrafts(env.AGENTS)).length;
  } catch {
    pending = -1;
  }
  tiles.push({
    key: "pending",
    label: "Pending drafts",
    value: pending < 0 ? "—" : pending,
    detail:
      pending < 0
        ? "Could not read queue"
        : pending === 0
          ? "Queue clear"
          : pending > 40
            ? "Backlog — review soon"
            : "Awaiting approval",
    tone: pending < 0 ? "bad" : pending === 0 ? "ok" : pending > 40 ? "bad" : pending > 15 ? "warn" : "neutral",
    href: "/admin/queue/",
  });

  // --- URL intake ---
  let urlQ = 0;
  try {
    urlQ = (await getUrlQueue(env.AGENTS)).length;
  } catch {
    urlQ = -1;
  }
  tiles.push({
    key: "intake",
    label: "URL intake",
    value: urlQ < 0 ? "—" : urlQ,
    detail: urlQ > 0 ? "Waiting for runner" : "Empty",
    tone: urlQ > 10 ? "warn" : "neutral",
    href: "/admin/intake/",
  });

  // --- Reader flags ---
  let flags = 0;
  try {
    flags = await openFlagCount(env.AGENTS);
  } catch {
    flags = -1;
  }
  tiles.push({
    key: "flags",
    label: "Open flags",
    value: flags < 0 ? "—" : flags,
    detail: flags > 0 ? "Reader reports open" : "None open",
    tone: flags > 0 ? "warn" : "ok",
    href: "/admin/flags/",
  });

  // --- Users (new 24h / 7d) ---
  let users24 = 0;
  let users7 = 0;
  let usersTotal = 0;
  try {
    const now = Date.now();
    const day = new Date(now - 86_400_000).toISOString();
    const week = new Date(now - 7 * 86_400_000).toISOString();
    const t = await env.DB.prepare("SELECT COUNT(*) AS n FROM user").first<{ n: number }>();
    usersTotal = t?.n ?? 0;
    const d24 = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM user WHERE createdAt >= ?"
    )
      .bind(day)
      .first<{ n: number }>();
    users24 = d24?.n ?? 0;
    const d7 = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM user WHERE createdAt >= ?"
    )
      .bind(week)
      .first<{ n: number }>();
    users7 = d7?.n ?? 0;
    const recent = await env.DB.prepare(
      "SELECT id, name, email, createdAt FROM user ORDER BY createdAt DESC LIMIT 8"
    ).all<{ id: string; name: string | null; email: string; createdAt: string }>();
    recentUsers = (recent.results ?? []).map((u) => ({
      id: u.id,
      name: (u.name || "").trim() || "—",
      email: u.email,
      createdAt: u.createdAt,
    }));
  } catch {
    /* D1 may be unavailable in some envs */
  }
  tiles.push({
    key: "users",
    label: "New users",
    value: users24,
    detail: `${users7} in 7d · ${usersTotal} total`,
    tone: users24 > 0 ? "neutral" : "ok",
    href: "/admin/users/",
  });

  // --- Privacy-first analytics (7d pageviews) ---
  let pv7 = 0;
  try {
    const weekDay = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const row = await env.DB.prepare(
      "SELECT COALESCE(SUM(pageviews),0) AS n FROM analytics_daily WHERE day >= ?"
    )
      .bind(weekDay)
      .first<{ n: number }>();
    pv7 = Number(row?.n ?? 0);
  } catch {
    pv7 = -1;
  }
  tiles.push({
    key: "analytics",
    label: "Pageviews · 7d",
    value: pv7 < 0 ? "—" : pv7,
    detail: pv7 < 0 ? "Analytics tables pending" : "Privacy-first · open dashboard",
    tone: pv7 > 0 ? "neutral" : "ok",
    href: "/admin/analytics/",
  });

  // --- Agents ---
  let failCount = 0;
  let disabledCount = 0;
  try {
    const reg = await getRegistry(env.AGENTS);
    for (const a of reg.agents) {
      if (!a.enabled) {
        disabledCount++;
        continue;
      }
      if (a.lastRun && !a.lastRun.ok) {
        failCount++;
        failingAgents.push({
          id: a.id,
          name: a.name,
          message: (a.lastRun.message || "failed").slice(0, 160),
          at: a.lastRun.at ?? null,
        });
      } else {
        const h = hoursSince(a.lastRun?.at);
        const expect = agentExpectedHours(a);
        if (h != null && h > expect) {
          staleAgents.push({
            id: a.id,
            name: a.name,
            hoursAgo: Math.round(h),
          });
        } else if (h == null) {
          staleAgents.push({ id: a.id, name: a.name, hoursAgo: -1 });
        }
      }
    }
  } catch {
    failCount = -1;
  }
  tiles.push({
    key: "agents-fail",
    label: "Failing agents",
    value: failCount < 0 ? "—" : failCount,
    detail:
      failCount < 0
        ? "Could not read registry"
        : failCount === 0
          ? disabledCount
            ? `${disabledCount} disabled`
            : "All recent runs OK"
          : "See list below",
    tone: failCount < 0 ? "bad" : failCount === 0 ? "ok" : "bad",
    href: "/admin/agents/",
  });
  tiles.push({
    key: "agents-stale",
    label: "Stale agents",
    value: staleAgents.length,
    detail: staleAgents.length ? "Overdue vs cron cadence" : "Running on schedule",
    tone: staleAgents.length > 3 ? "warn" : staleAgents.length ? "neutral" : "ok",
    href: "/admin/agents/",
  });

  // --- Content freshness ---
  let published = 0;
  let lastPublish: string | null = null;
  let lastAgeH: number | null = null;
  try {
    const posts = await getCollection("posts", (p) => !p.data.draft);
    published = posts.length;
    const times = posts.map((p) => p.data.publishedAt.getTime()).filter((n) => Number.isFinite(n));
    if (times.length) {
      const max = Math.max(...times);
      lastPublish = new Date(max).toISOString();
      lastAgeH = (Date.now() - max) / 3_600_000;
    }
  } catch {
    published = -1;
  }
  const ageLabel =
    lastAgeH == null
      ? "No publishes"
      : lastAgeH < 1
        ? "Last <1h ago"
        : lastAgeH < 48
          ? `Last ${Math.round(lastAgeH)}h ago`
          : `Last ${Math.round(lastAgeH / 24)}d ago`;
  tiles.push({
    key: "content",
    label: "Published",
    value: published < 0 ? "—" : published.toLocaleString("en-US"),
    detail: ageLabel,
    tone:
      lastAgeH == null
        ? "warn"
        : lastAgeH > 48
          ? "warn"
          : lastAgeH > 24
            ? "neutral"
            : "ok",
    href: "/admin/posts/",
  });

  // Sort failing by most recent failure first
  failingAgents.sort((a, b) => {
    const ta = a.at ? Date.parse(a.at) : 0;
    const tb = b.at ? Date.parse(b.at) : 0;
    return tb - ta;
  });

  return {
    tiles,
    failingAgents: failingAgents.slice(0, 12),
    staleAgents: staleAgents.slice(0, 12),
    recentUsers,
    generatedAt: new Date().toISOString(),
  };
}
