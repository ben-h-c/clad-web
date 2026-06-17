import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getSessionUser } from "~/lib/user-data";

export const prerender = false;

// The iOS app posts its APNs device token here after the user grants
// notification permission. Public (no editor basic-auth) so anonymous
// devices can opt into breaking-news alerts; if a session cookie is
// present we associate the token with that account.
//
// Body: { token: string (hex), environment?: "sandbox" | "production" }
export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  // APNs tokens are 64 hex chars (32 bytes) historically, but Apple has said
  // not to hard-code the length — accept a reasonable hex range.
  if (!/^[0-9a-fA-F]{32,200}$/.test(token)) {
    return json({ error: "Invalid device token" }, 400);
  }
  const environment = body?.environment === "sandbox" ? "sandbox" : "production";

  const user = await getSessionUser(request.headers);
  const now = new Date().toISOString();

  // Upsert: re-registration (token rotation, env change, sign-in) refreshes
  // the row rather than duplicating it.
  await env.DB.prepare(
    "INSERT INTO push_token (token, userId, environment, createdAt, updatedAt) " +
      "VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(token) DO UPDATE SET " +
      "userId = excluded.userId, environment = excluded.environment, updatedAt = excluded.updatedAt"
  )
    .bind(token, user?.id ?? null, environment, now, now)
    .run();

  return json({ ok: true }, 200);
};

// Allow a device to unregister (e.g. user turned notifications off).
export const DELETE: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) return json({ error: "Missing token" }, 400);
  await env.DB.prepare("DELETE FROM push_token WHERE token = ?").bind(token).run();
  return json({ ok: true }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
