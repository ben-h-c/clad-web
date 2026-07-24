import type { APIRoute } from "astro";
import { getAuth } from "~/lib/auth-server";
import { env } from "cloudflare:workers";

export const prerender = false;

/** Paths that are brute-force / email-flood sensitive. */
const SENSITIVE_AUTH = new Set([
  "/api/auth/sign-in/email",
  "/api/auth/sign-up/email",
  "/api/auth/forget-password",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
  "/api/auth/send-verification-email",
]);

function clientIp(request: Request, clientAddress?: string): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    clientAddress ||
    "unknown"
  );
}

// Mount Better Auth's request handler for all /api/auth/* routes (sign-up,
// sign-in, sign-out, social callbacks, verification, password reset, etc.).
export const ALL: APIRoute = async ({ request, clientAddress }) => {
  const url = new URL(request.url);

  // Cloudflare Rate Limiting binding — durable across isolates (belt with
  // Better Auth's secondaryStorage rateLimit).
  if (request.method === "POST" && SENSITIVE_AUTH.has(url.pathname) && env.FACTCHECK_LIMITER) {
    const ip = clientIp(request, clientAddress);
    const pathKey = url.pathname.replace(/^\/api\/auth\//, "").replace(/\//g, "-");
    const { success } = await env.FACTCHECK_LIMITER.limit({ key: `auth:${pathKey}:${ip}` });
    if (!success) {
      return new Response(JSON.stringify({ message: "Too many attempts. Try again in a minute." }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
  }

  // Guard against duplicate-email sign-ups. Better Auth returns 200 with a
  // fabricated user even when the email already exists (the DB unique index
  // silently rejects the row), so we reject up front with a clear message —
  // this also avoids firing a verification email at an address that already
  // belongs to a Google/X account.
  // Product note: 409 enumerates registered emails (deliberate UX trade-off).
  if (request.method === "POST" && url.pathname === "/api/auth/sign-up/email") {
    let raw = "";
    let email = "";
    try {
      raw = await request.text();
      const parsed = JSON.parse(raw);
      if (typeof parsed?.email === "string") email = parsed.email.trim().toLowerCase();
    } catch {
      /* malformed body — let Better Auth handle it below */
    }

    if (email) {
      const existing = await env.DB.prepare(
        "SELECT id FROM user WHERE lower(email) = ? LIMIT 1"
      )
        .bind(email)
        .first();
      if (existing) {
        return new Response(
          JSON.stringify({
            message: "An account with this email already exists. Please sign in instead.",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Strip legacy birthday if a client still sends it (not a Better Auth field).
    let baBody = raw;
    try {
      const p = JSON.parse(raw);
      if ("birthday" in p) {
        delete p.birthday;
        baBody = JSON.stringify(p);
      }
    } catch {
      /* keep raw */
    }

    return getAuth().handler(
      new Request(request.url, { method: "POST", headers: request.headers, body: baBody || undefined })
    );
  }
  return getAuth().handler(request);
};
