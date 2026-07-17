import type { APIRoute } from "astro";
import { getAuth } from "~/lib/auth-server";
import { env } from "cloudflare:workers";
import {
  DEFAULT_PREFS,
  MIN_ACCOUNT_AGE,
  sanitizeBirthday,
  setPrefs,
} from "~/lib/user-data";

export const prerender = false;

// Mount Better Auth's request handler for all /api/auth/* routes (sign-up,
// sign-in, sign-out, social callbacks, verification, password reset, etc.).
export const ALL: APIRoute = async ({ request }) => {
  // Guard against duplicate-email sign-ups. Better Auth returns 200 with a
  // fabricated user even when the email already exists (the DB unique index
  // silently rejects the row), so we reject up front with a clear message —
  // this also avoids firing a verification email at an address that already
  // belongs to a Google/X account.
  // Require + persist birthday (private prefs) for email sign-ups.
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/api/auth/sign-up/email") {
    let raw = "";
    let email = "";
    let birthdayRaw: unknown = null;
    try {
      raw = await request.text();
      const parsed = JSON.parse(raw);
      if (typeof parsed?.email === "string") email = parsed.email.trim().toLowerCase();
      birthdayRaw = parsed?.birthday;
    } catch {
      /* malformed body — let Better Auth handle it below */
    }

    const birthday = sanitizeBirthday(birthdayRaw);
    if (!birthday) {
      return new Response(
        JSON.stringify({
          message: `Birthday is required. You must be at least ${MIN_ACCOUNT_AGE} years old.`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
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

    // Strip birthday before Better Auth (unknown field); we store it ourselves.
    let baBody = raw;
    try {
      const p = JSON.parse(raw);
      delete p.birthday;
      baBody = JSON.stringify(p);
    } catch {
      /* keep raw */
    }

    const res = await getAuth().handler(
      new Request(request.url, { method: "POST", headers: request.headers, body: baBody })
    );

    // Persist private birthday prefs for the new user (no session until verified).
    if (res.ok && email) {
      try {
        const row = await env.DB.prepare(
          "SELECT id FROM user WHERE lower(email) = ? LIMIT 1"
        )
          .bind(email)
          .first<{ id: string }>();
        if (row?.id) {
          await setPrefs(row.id, { ...DEFAULT_PREFS, birthday });
        }
      } catch (err) {
        console.error("sign-up: failed to save birthday prefs", err);
      }
    }

    return res;
  }
  return getAuth().handler(request);
};
