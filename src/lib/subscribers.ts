/**
 * Standalone newsletter subscribers — email capture WITHOUT an account.
 * Double opt-in: POST /api/subscribe stores a pending row and emails a
 * confirmation link; the address only receives the weekly newsletter after
 * the link is clicked. Unsubscribe is one click via the tokened link in
 * every send. Account holders manage email via /account/ preferences instead
 * — this table is only for readers who never registered.
 */
import { env } from "cloudflare:workers";

export interface Subscriber {
  email: string;
  token: string;
  status: "pending" | "confirmed" | "unsubscribed";
}

let tableReady = false;
async function ensureTable(): Promise<void> {
  if (tableReady) return;
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS newsletter_subscriber (" +
      "email TEXT PRIMARY KEY, " +
      "token TEXT NOT NULL UNIQUE, " +
      "status TEXT NOT NULL DEFAULT 'pending', " +
      "createdAt TEXT NOT NULL, " +
      "confirmedAt TEXT, " +
      "unsubscribedAt TEXT)"
  ).run();
  tableReady = true;
}

export function validEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) && s.length <= 254;
}

function newToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Insert or refresh a pending subscription; returns the row's token.
 *  Already-confirmed addresses come back with status "confirmed" so the
 *  caller can skip re-sending a confirmation email. */
export async function upsertPending(email: string): Promise<Subscriber> {
  await ensureTable();
  const existing = await env.DB.prepare(
    "SELECT email, token, status FROM newsletter_subscriber WHERE email = ?"
  )
    .bind(email)
    .first<Subscriber>();
  if (existing && existing.status === "confirmed") return existing;

  const token = existing?.token ?? newToken();
  await env.DB.prepare(
    "INSERT INTO newsletter_subscriber (email, token, status, createdAt) VALUES (?, ?, 'pending', ?) " +
      "ON CONFLICT(email) DO UPDATE SET status = 'pending', unsubscribedAt = NULL"
  )
    .bind(email, token, new Date().toISOString())
    .run();
  return { email, token, status: "pending" };
}

export async function confirmByToken(token: string): Promise<boolean> {
  await ensureTable();
  const res = await env.DB.prepare(
    "UPDATE newsletter_subscriber SET status = 'confirmed', confirmedAt = ? " +
      "WHERE token = ? AND status != 'unsubscribed'"
  )
    .bind(new Date().toISOString(), token)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  await ensureTable();
  const res = await env.DB.prepare(
    "UPDATE newsletter_subscriber SET status = 'unsubscribed', unsubscribedAt = ? WHERE token = ?"
  )
    .bind(new Date().toISOString(), token)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function confirmedSubscribers(limit: number): Promise<Subscriber[]> {
  await ensureTable();
  const rows = await env.DB.prepare(
    "SELECT email, token, status FROM newsletter_subscriber WHERE status = 'confirmed' LIMIT ?"
  )
    .bind(limit)
    .all<Subscriber>();
  return rows.results ?? [];
}
