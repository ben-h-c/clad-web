import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getSessionUser, jsonResponse, userHasPassword, deleteUserAndData } from "~/lib/user-data";
import { getAuth } from "~/lib/auth-server";

export const prerender = false;

// POST /api/me/delete-account — self-serve, permanent account deletion
// (App Store Guideline 5.1.1(v)). Requires re-authentication: password for
// email/password accounts, or typing the account email for social-only
// accounts. Then removes the user and all their data via deleteUserAndData.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);

  // Rate-limit this destructive action per IP.
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    clientAddress ||
    "unknown";
  if (env.FACTCHECK_LIMITER) {
    const { success } = await env.FACTCHECK_LIMITER.limit({ key: `delete:${ip}` });
    if (!success) {
      return jsonResponse({ error: "Too many attempts. Try again in a minute." }, 429);
    }
  }

  let p: any;
  try {
    p = await request.json();
  } catch {
    p = {};
  }

  // Re-authenticate before deleting.
  if (await userHasPassword(user.id)) {
    const password = String(p?.password ?? "");
    if (!password) return jsonResponse({ error: "Enter your password to confirm." }, 400);
    try {
      // Verifies the password without touching the current session; a transient
      // session it may create is removed by the deletion that follows.
      await getAuth().api.signInEmail({ body: { email: user.email, password } });
    } catch {
      return jsonResponse({ error: "Incorrect password." }, 403);
    }
  } else {
    const confirmEmail = String(p?.confirmEmail ?? "").trim().toLowerCase();
    if (!confirmEmail || confirmEmail !== user.email.toLowerCase()) {
      return jsonResponse({ error: "Type your account email to confirm." }, 400);
    }
  }

  await deleteUserAndData(user.id);

  // Clear the session cookie (both the local and __Secure- production variants)
  // and tell the client where to land.
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  headers.append("Set-Cookie", "better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  headers.append(
    "Set-Cookie",
    "__Secure-better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
  );
  return new Response(JSON.stringify({ ok: true, redirect: "/goodbye/" }), { status: 200, headers });
};
