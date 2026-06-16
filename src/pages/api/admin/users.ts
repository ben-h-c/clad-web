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

  if (action !== "delete") return json({ error: "Unknown action" }, 400);

  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM session WHERE userId = ?").bind(id),
      env.DB.prepare("DELETE FROM account WHERE userId = ?").bind(id),
      env.DB.prepare("DELETE FROM topic_alert WHERE userId = ?").bind(id),
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
