import type { APIRoute } from "astro";
import { getAuth } from "~/lib/auth-server";
import { env } from "cloudflare:workers";

export const prerender = false;

// Mount Better Auth's request handler for all /api/auth/* routes (sign-up,
// sign-in, sign-out, social callbacks, verification, password reset, etc.).
export const ALL: APIRoute = async ({ request }) => {
  // Guard against duplicate-email sign-ups. Better Auth returns 200 with a
  // fabricated user even when the email already exists (the DB unique index
  // silently rejects the row), so we reject up front with a clear message —
  // this also avoids firing a verification email at an address that already
  // belongs to a Google/X account.
  const url = new URL(request.url);
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
