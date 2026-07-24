import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getSessionUser, jsonResponse, userHasPassword } from "~/lib/user-data";
import { getAuth } from "~/lib/auth-server";

export const prerender = false;

/**
 * POST /api/me/password — change password for email/password accounts.
 * Body: { currentPassword, newPassword }
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);

  if (!(await userHasPassword(user.id))) {
    return jsonResponse(
      { error: "This account uses social sign-in. Password change is not available." },
      400
    );
  }

  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    clientAddress ||
    "unknown";
  if (env.FACTCHECK_LIMITER) {
    const { success } = await env.FACTCHECK_LIMITER.limit({ key: `pw:${user.id}:${ip}` });
    if (!success) {
      return jsonResponse({ error: "Too many attempts. Try again later." }, 429);
    }
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const currentPassword = String(body?.currentPassword ?? "");
  const newPassword = String(body?.newPassword ?? "");
  if (currentPassword.length < 1) {
    return jsonResponse({ error: "Enter your current password." }, 400);
  }
  if (newPassword.length < 8) {
    return jsonResponse({ error: "New password must be at least 8 characters." }, 400);
  }
  if (newPassword.length > 128) {
    return jsonResponse({ error: "New password is too long." }, 400);
  }

  try {
    // Better Auth changePassword (requires current session + current password).
    await getAuth().api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      },
      headers: request.headers,
    });
    return jsonResponse({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    if (/password|invalid|incorrect/i.test(msg)) {
      return jsonResponse({ error: "Current password is incorrect." }, 403);
    }
    return jsonResponse({ error: "Could not change password. Try again." }, 502);
  }
};
