import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

// Manage user accounts (basic-auth via middleware). Currently: delete an account
// and all of its associated rows.
export const POST: APIRoute = async ({ request }) => {
  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const action = String(p?.action ?? "");
  const id = String(p?.id ?? "").trim();
  if (!id) return json({ error: "Missing user id" }, 400);

  // Comp / support: manually grant or revoke Premium without Stripe.
  if (action === "grant" || action === "revoke") {
    const status = action === "grant" ? "active" : "canceled";
    // Far-future period end for comps so it never lapses on a date check.
    const periodEnd = action === "grant" ? "2099-01-01" : null;
    try {
      await env.DB.prepare(
        `INSERT INTO subscription (userId, status, plan, currentPeriodEnd, updatedAt)
         VALUES (?, ?, 'comp', ?, ?)
         ON CONFLICT(userId) DO UPDATE SET status = excluded.status, currentPeriodEnd = excluded.currentPeriodEnd, updatedAt = excluded.updatedAt`
      )
        .bind(id, status, periodEnd, new Date().toISOString())
        .run();
      return json({ ok: true, status }, 200);
    } catch (e: any) {
      return json({ error: e?.message ?? "Update failed" }, 502);
    }
  }

  if (action !== "delete") return json({ error: "Unknown action" }, 400);

  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM session WHERE userId = ?").bind(id),
      env.DB.prepare("DELETE FROM account WHERE userId = ?").bind(id),
      env.DB.prepare("DELETE FROM topic_alert WHERE userId = ?").bind(id),
      env.DB.prepare("DELETE FROM favorite WHERE userId = ?").bind(id),
      env.DB.prepare("DELETE FROM subscription WHERE userId = ?").bind(id),
      env.DB.prepare("DELETE FROM user_preferences WHERE userId = ?").bind(id),
      env.DB.prepare("DELETE FROM user WHERE id = ?").bind(id),
    ]);
    return json({ ok: true }, 200);
  } catch (e: any) {
    return json({ error: e?.message ?? "Delete failed" }, 502);
  }
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
