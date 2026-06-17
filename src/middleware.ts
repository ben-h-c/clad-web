import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { checkBasicAuth, unauthorized } from "~/lib/auth";

// Agent endpoints authenticate with a bearer token inside the route, so they
// must bypass the editor basic-auth gate.
const AGENT_API = (path: string) => path.startsWith("/api/agent/");

// Logged-in reader endpoints (favorites, preferences, alerts) authenticate via
// the Better Auth session cookie inside each route, so they bypass the editor
// basic-auth gate but are NOT public — the routes return 401 without a session.
const USER_API = (path: string) => path.startsWith("/api/me/");

// Stripe endpoints: checkout/portal check the session inside; the webhook is
// verified by Stripe's signature. Neither sits behind the editor basic-auth gate.
const STRIPE_API = (path: string) => path.startsWith("/api/stripe/");

// Public, unauthenticated endpoints. Readers submit grade/lean disputes at
// /api/flag (rate-limited in the route); /api/auth/* is the user-account
// (Better Auth) surface and must not sit behind the editor basic-auth gate.
// /api/posts(.json|/<slug>.json) is the reader JSON feed consumed by the
// iOS app (and any future client) — tier gating happens inside the route
// via getAccess(), same model as the homepage.
const PUBLIC_API = (path: string) =>
  path === "/api/flag" ||
  path.startsWith("/api/auth/") ||
  path === "/api/posts.json" ||
  path.startsWith("/api/posts/") ||
  // iOS push-token (un)registration. Anonymous devices may opt into
  // breaking-news alerts; the route reads any session cookie itself.
  path.startsWith("/api/push/");

const PROTECTED = (path: string) =>
  path === "/admin" ||
  path.startsWith("/admin/") ||
  path.startsWith("/api/");

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  // The sitemap endpoint lives at /sitemap.xml; some clients (Search Console)
  // request the trailing-slash form, which would 404 — redirect it.
  if (path === "/sitemap.xml/") return context.redirect("/sitemap.xml", 301);
  if (AGENT_API(path)) return next();
  if (USER_API(path)) return next();
  if (STRIPE_API(path)) return next();
  if (PUBLIC_API(path)) return next();
  if (!PROTECTED(path)) return next();

  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) {
    return new Response(
      "Admin credentials are not configured on the server.",
      { status: 503, headers: { "Content-Type": "text/plain" } }
    );
  }

  const ok = checkBasicAuth(
    context.request.headers.get("authorization"),
    env.ADMIN_USER,
    env.ADMIN_PASSWORD
  );
  if (!ok) return unauthorized();

  return next();
});
