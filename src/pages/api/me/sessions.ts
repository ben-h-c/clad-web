import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getSessionUser, jsonResponse } from "~/lib/user-data";
import { getAuth } from "~/lib/auth-server";

export const prerender = false;

/**
 * POST /api/me/sessions — { action: "revoke-others" | "revoke-all" }
 * Sign out other devices (or all including this one).
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);

  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    clientAddress ||
    "unknown";
  if (env.FACTCHECK_LIMITER) {
    const { success } = await env.FACTCHECK_LIMITER.limit({ key: `sessions:${user.id}:${ip}` });
    if (!success) {
      return jsonResponse({ error: "Too many attempts. Try again later." }, 429);
    }
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const action = String(body?.action || "revoke-others");

  try {
    if (action === "revoke-all") {
      // Drop every session row for this user; client must re-login.
      await env.DB.prepare("DELETE FROM session WHERE userId = ?").bind(user.id).run();
      const headers = new Headers({
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      headers.append(
        "Set-Cookie",
        "better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
      );
      headers.append(
        "Set-Cookie",
        "__Secure-better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
      );
      return new Response(JSON.stringify({ ok: true, revoked: "all" }), { status: 200, headers });
    }

    // revoke-others: keep current session token
    const session = await getAuth().api.getSession({ headers: request.headers });
    const currentToken = (session as any)?.session?.token as string | undefined;
    if (currentToken) {
      await env.DB.prepare("DELETE FROM session WHERE userId = ? AND token != ?")
        .bind(user.id, currentToken)
        .run();
    } else {
      await env.DB.prepare("DELETE FROM session WHERE userId = ?").bind(user.id).run();
    }
    return jsonResponse({ ok: true, revoked: "others" });
  } catch (e: any) {
    return jsonResponse({ error: e?.message ?? "Could not revoke sessions" }, 502);
  }
};
