import { env } from "cloudflare:workers";
import { getAuth } from "./auth-server";

export interface UserPrefs {
  newsletter: boolean;
  digest: "off" | "weekly" | "daily";
  breakingAlerts: boolean;
}
export const DEFAULT_PREFS: UserPrefs = {
  newsletter: false,
  digest: "off",
  breakingAlerts: false,
};

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string | null; // ISO; used for the free-trial window
}

/** Resolve the signed-in user from the request cookies, or null. */
export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers });
  const u = session?.user;
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: !!u.emailVerified,
    createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// --- Preferences -----------------------------------------------------------
export async function getPrefs(userId: string): Promise<UserPrefs> {
  const row = await env.DB.prepare("SELECT prefs FROM user_preferences WHERE userId = ?")
    .bind(userId)
    .first<{ prefs: string }>();
  if (!row) return { ...DEFAULT_PREFS };
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(row.prefs) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function setPrefs(userId: string, prefs: UserPrefs): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO user_preferences (userId, prefs, updatedAt) VALUES (?, ?, ?) " +
      "ON CONFLICT(userId) DO UPDATE SET prefs = excluded.prefs, updatedAt = excluded.updatedAt"
  )
    .bind(userId, JSON.stringify(prefs), new Date().toISOString())
    .run();
}

/** Coerce arbitrary input into a valid UserPrefs (defends the write path). */
export function sanitizePrefs(input: unknown): UserPrefs {
  const o = (input ?? {}) as Record<string, unknown>;
  const digest = o.digest === "weekly" || o.digest === "daily" ? o.digest : "off";
  return {
    newsletter: !!o.newsletter,
    digest,
    breakingAlerts: !!o.breakingAlerts,
  };
}

// --- Favorites -------------------------------------------------------------
export interface Favorite {
  slug: string;
  headline: string;
  createdAt: string;
}
export async function listFavorites(userId: string): Promise<Favorite[]> {
  const res = await env.DB.prepare(
    "SELECT slug, headline, createdAt FROM favorite WHERE userId = ? ORDER BY createdAt DESC"
  )
    .bind(userId)
    .all<Favorite>();
  return res.results ?? [];
}
export async function addFavorite(userId: string, slug: string, headline: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO favorite (id, userId, slug, headline, createdAt) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(userId, slug) DO NOTHING"
  )
    .bind(crypto.randomUUID(), userId, slug, headline.slice(0, 300), new Date().toISOString())
    .run();
}
export async function removeFavorite(userId: string, slug: string): Promise<void> {
  await env.DB.prepare("DELETE FROM favorite WHERE userId = ? AND slug = ?").bind(userId, slug).run();
}

// --- Topic alerts ----------------------------------------------------------
export interface Alert {
  id: string;
  topic: string;
  createdAt: string;
}
export async function listAlerts(userId: string): Promise<Alert[]> {
  const res = await env.DB.prepare(
    "SELECT id, topic, createdAt FROM topic_alert WHERE userId = ? ORDER BY createdAt DESC"
  )
    .bind(userId)
    .all<Alert>();
  return res.results ?? [];
}
export async function addAlert(userId: string, topic: string): Promise<Alert | null> {
  const t = topic.trim().slice(0, 80);
  if (!t) return null;
  const dup = await env.DB.prepare(
    "SELECT id FROM topic_alert WHERE userId = ? AND lower(topic) = lower(?)"
  )
    .bind(userId, t)
    .first<{ id: string }>();
  if (dup) return null;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO topic_alert (id, userId, topic, createdAt) VALUES (?, ?, ?, ?)"
  )
    .bind(id, userId, t, createdAt)
    .run();
  return { id, topic: t, createdAt };
}
export async function removeAlert(userId: string, id: string): Promise<void> {
  await env.DB.prepare("DELETE FROM topic_alert WHERE userId = ? AND id = ?").bind(userId, id).run();
}
