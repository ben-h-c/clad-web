import { env } from "cloudflare:workers";
import { getAuth } from "./auth-server.ts";
import { cancelSubscription } from "./stripe.ts";

export type ThemePref = "light" | "dark";

export interface UserPrefs {
  newsletter: boolean;
  digest: "off" | "weekly" | "daily";
  breakingAlerts: boolean;
  /** Preferred reading theme when signed in (synced to localStorage). */
  theme: ThemePref;
}
export const DEFAULT_PREFS: UserPrefs = {
  newsletter: false,
  digest: "off",
  breakingAlerts: false,
  theme: "dark",
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
  // Dark is the product default; only explicit "light" opts out.
  const theme: ThemePref = o.theme === "light" ? "light" : "dark";
  return {
    newsletter: !!o.newsletter,
    digest,
    breakingAlerts: !!o.breakingAlerts,
    theme,
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

// --- Reader reactions (comments + agree/disagree on grade & lean) ----------
export type Vote = "agree" | "disagree";

export interface PostComment {
  id: string;
  userId: string;
  authorName: string;
  body: string;
  gradeVote: Vote | null;
  leanVote: Vote | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommentTally {
  total: number;
  gradeAgree: number;
  gradeDisagree: number;
  leanAgree: number;
  leanDisagree: number;
}

/** Coerce arbitrary input into a valid vote ("agree" | "disagree") or null. */
export function sanitizeVote(input: unknown): Vote | null {
  return input === "agree" || input === "disagree" ? input : null;
}

/** Display name shown publicly on a reaction: first name + last initial. */
export function publicName(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Reader";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export async function listCommentsForPost(postSlug: string): Promise<PostComment[]> {
  const res = await env.DB.prepare(
    "SELECT id, userId, authorName, body, gradeVote, leanVote, createdAt, updatedAt " +
      "FROM comment WHERE postSlug = ? ORDER BY updatedAt DESC"
  )
    .bind(postSlug)
    .all<PostComment>();
  return res.results ?? [];
}

export async function getCommentTally(postSlug: string): Promise<CommentTally> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS total, " +
      "SUM(CASE WHEN gradeVote = 'agree' THEN 1 ELSE 0 END) AS gradeAgree, " +
      "SUM(CASE WHEN gradeVote = 'disagree' THEN 1 ELSE 0 END) AS gradeDisagree, " +
      "SUM(CASE WHEN leanVote = 'agree' THEN 1 ELSE 0 END) AS leanAgree, " +
      "SUM(CASE WHEN leanVote = 'disagree' THEN 1 ELSE 0 END) AS leanDisagree " +
      "FROM comment WHERE postSlug = ?"
  )
    .bind(postSlug)
    .first<{ total: number; gradeAgree: number; gradeDisagree: number; leanAgree: number; leanDisagree: number }>();
  return {
    total: row?.total ?? 0,
    gradeAgree: row?.gradeAgree ?? 0,
    gradeDisagree: row?.gradeDisagree ?? 0,
    leanAgree: row?.leanAgree ?? 0,
    leanDisagree: row?.leanDisagree ?? 0,
  };
}

export async function getUserComment(userId: string, postSlug: string): Promise<PostComment | null> {
  const row = await env.DB.prepare(
    "SELECT id, userId, authorName, body, gradeVote, leanVote, createdAt, updatedAt " +
      "FROM comment WHERE userId = ? AND postSlug = ?"
  )
    .bind(userId, postSlug)
    .first<PostComment>();
  return row ?? null;
}

/** Insert or update the user's single reaction for a post. */
export async function upsertComment(
  userId: string,
  authorName: string,
  postSlug: string,
  body: string,
  gradeVote: Vote | null,
  leanVote: Vote | null
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO comment (id, postSlug, userId, authorName, body, gradeVote, leanVote, createdAt, updatedAt) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(userId, postSlug) DO UPDATE SET " +
      "authorName = excluded.authorName, body = excluded.body, " +
      "gradeVote = excluded.gradeVote, leanVote = excluded.leanVote, updatedAt = excluded.updatedAt"
  )
    .bind(
      crypto.randomUUID(),
      postSlug,
      userId,
      authorName.slice(0, 120),
      body.slice(0, 2000),
      gradeVote,
      leanVote,
      now,
      now
    )
    .run();
}

/** A user removing their own reaction. */
export async function deleteOwnComment(userId: string, postSlug: string): Promise<void> {
  await env.DB.prepare("DELETE FROM comment WHERE userId = ? AND postSlug = ?")
    .bind(userId, postSlug)
    .run();
}

/** Editor moderation: remove any reaction by id. */
export async function deleteCommentById(id: string): Promise<void> {
  await env.DB.prepare("DELETE FROM comment WHERE id = ?").bind(id).run();
}

export interface AdminComment extends PostComment {
  postSlug: string;
}
export async function listRecentComments(limit = 200): Promise<AdminComment[]> {
  const res = await env.DB.prepare(
    "SELECT id, postSlug, userId, authorName, body, gradeVote, leanVote, createdAt, updatedAt " +
      "FROM comment ORDER BY updatedAt DESC LIMIT ?"
  )
    .bind(Math.max(1, Math.min(1000, limit)))
    .all<AdminComment>();
  return res.results ?? [];
}

/** Editor moderation search: match the query against the comment body, author
 *  name, or post slug (case-insensitive substring). Empty query falls back to
 *  the recent list. */
export async function searchComments(query: string, limit = 300): Promise<AdminComment[]> {
  const q = query.trim();
  if (!q) return listRecentComments(limit);
  // Escape LIKE wildcards so user input is treated literally.
  const like = "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  const res = await env.DB.prepare(
    "SELECT id, postSlug, userId, authorName, body, gradeVote, leanVote, createdAt, updatedAt " +
      "FROM comment WHERE body LIKE ? ESCAPE '\\' OR authorName LIKE ? ESCAPE '\\' " +
      "OR postSlug LIKE ? ESCAPE '\\' ORDER BY updatedAt DESC LIMIT ?"
  )
    .bind(like, like, like, Math.max(1, Math.min(1000, limit)))
    .all<AdminComment>();
  return res.results ?? [];
}

// --- Account deletion ------------------------------------------------------
/** True if the user has an email/password credential (vs. social-only). Drives
 *  whether account deletion re-auths with a password or an email confirmation. */
export async function userHasPassword(userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT 1 AS x FROM account WHERE userId = ? AND providerId = 'credential' AND password IS NOT NULL LIMIT 1"
  )
    .bind(userId)
    .first();
  return !!row;
}

/**
 * Permanently delete a user and every row that references them, across all
 * tables. Best-effort cancels an active Stripe subscription first; Apple IAP
 * subscriptions are managed by Apple and cannot be cancelled server-side (the
 * user must cancel in iOS Settings). Used by both the self-serve delete route
 * and the admin delete, so the two stay consistent and complete.
 */
export async function deleteUserAndData(userId: string): Promise<void> {
  const u = await env.DB.prepare("SELECT email FROM user WHERE id = ?")
    .bind(userId)
    .first<{ email: string }>();
  const sub = await env.DB.prepare(
    "SELECT stripeSubscriptionId, status FROM subscription WHERE userId = ?"
  )
    .bind(userId)
    .first<{ stripeSubscriptionId: string | null; status: string }>();
  if (sub?.stripeSubscriptionId && sub.status !== "canceled") {
    try {
      await cancelSubscription(sub.stripeSubscriptionId);
    } catch {
      /* best-effort: still delete local data even if Stripe cancel fails */
    }
  }

  const byUser = (sql: string) => env.DB.prepare(sql).bind(userId);
  const stmts = [
    byUser("DELETE FROM session WHERE userId = ?"),
    byUser("DELETE FROM account WHERE userId = ?"),
    byUser("DELETE FROM user_preferences WHERE userId = ?"),
    byUser("DELETE FROM topic_alert WHERE userId = ?"),
    byUser("DELETE FROM favorite WHERE userId = ?"),
    byUser("DELETE FROM subscription WHERE userId = ?"),
    byUser("DELETE FROM digest_send WHERE userId = ?"),
    byUser("DELETE FROM newsletter_send WHERE userId = ?"),
    byUser("DELETE FROM apple_subscription WHERE userId = ?"),
    byUser("DELETE FROM push_token WHERE userId = ?"),
    byUser("DELETE FROM comment WHERE userId = ?"),
  ];
  // verification rows are keyed by email (identifier), not userId.
  if (u?.email) {
    stmts.push(env.DB.prepare("DELETE FROM verification WHERE identifier = ?").bind(u.email));
  }
  stmts.push(env.DB.prepare("DELETE FROM user WHERE id = ?").bind(userId));
  await env.DB.batch(stmts);
}
