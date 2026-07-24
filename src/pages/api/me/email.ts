import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getSessionUser, jsonResponse } from "~/lib/user-data";
import { getAuth } from "~/lib/auth-server";
import { validEmail } from "~/lib/subscribers";

export const prerender = false;

/**
 * POST /api/me/email — request email change (re-verification required).
 * Body: { newEmail: string }
 *
 * Better Auth sends confirmation to the current address and/or verification
 * to the new one when RESEND is configured. Full access stays gated on
 * emailVerified after the change.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);

  if (!env.RESEND_API_KEY) {
    return jsonResponse(
      { error: "Email change requires transactional email. Contact support." },
      503
    );
  }

  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    clientAddress ||
    "unknown";
  if (env.FACTCHECK_LIMITER) {
    const { success } = await env.FACTCHECK_LIMITER.limit({ key: `email-change:${user.id}:${ip}` });
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
  const newEmail = String(body?.newEmail ?? "").trim().toLowerCase();
  if (!validEmail(newEmail)) {
    return jsonResponse({ error: "Enter a valid email address." }, 400);
  }
  if (newEmail === user.email.toLowerCase()) {
    return jsonResponse({ error: "That's already your email." }, 400);
  }

  try {
    await getAuth().api.changeEmail({
      body: {
        newEmail,
        callbackURL: "/account/",
      },
      headers: request.headers,
    });
    return jsonResponse({
      ok: true,
      message:
        "Check your inbox to confirm the change. Your account stays on the current email until you verify.",
    });
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    if (/same|already/i.test(msg)) {
      return jsonResponse({ error: "Could not change to that email." }, 400);
    }
    if (/disabled|isn't enabled|verification/i.test(msg)) {
      return jsonResponse({ error: "Email change is not available right now." }, 503);
    }
    console.error("changeEmail failed:", msg.slice(0, 200));
    return jsonResponse({ error: "Could not start email change. Try again." }, 502);
  }
};
