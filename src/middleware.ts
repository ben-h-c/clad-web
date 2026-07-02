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

// Reader reactions: GET lists comments (full-access readers), POST/DELETE
// require a premium session — all enforced inside src/pages/api/comments.ts,
// so it bypasses the editor basic-auth gate. The /api/admin/comments
// moderation route is intentionally NOT here, so it stays behind basic-auth.
const COMMENTS_API = (path: string) => path === "/api/comments";

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
  // Server-side site search — public; grades are nulled inside for free users.
  path === "/api/search" ||
  path === "/api/posts.json" ||
  path.startsWith("/api/posts/") ||
  // iOS push-token (un)registration. Anonymous devices may opt into
  // breaking-news alerts; the route reads any session cookie itself.
  path.startsWith("/api/push/") ||
  // iOS in-app purchase: /api/iap/apple reads the session cookie itself;
  // /api/iap/apple/notifications is Apple's server webhook (no session).
  path.startsWith("/api/iap/");

const PROTECTED = (path: string) =>
  path === "/admin" ||
  path.startsWith("/admin/") ||
  path.startsWith("/api/");

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const method = context.request.method;
  // Trailing-slash policy (trailingSlash: "always"): 301 bare page URLs to
  // their canonical slash form so every page has one indexable URL. /api/* is
  // exempt to keep the JSON contract byte-stable for the iOS app; the
  // file-extension test exempts real files (/sitemap.xml, /rss.xml,
  // /og/*.png, /favicon.svg, /google*.html).
  if (
    (method === "GET" || method === "HEAD") &&
    path !== "/" &&
    !path.endsWith("/") &&
    !path.startsWith("/api/") &&
    !/\.[a-z0-9]+$/i.test(path)
  ) {
    return context.redirect(path + "/" + context.url.search, 301);
  }
  // The XML endpoints live at extension paths; some clients (Search Console)
  // request the trailing-slash form, which would 404 — redirect it.
  if (path === "/sitemap.xml/") return context.redirect("/sitemap.xml", 301);
  if (path === "/rss.xml/") return context.redirect("/rss.xml", 301);
  if (AGENT_API(path)) return next();
  if (USER_API(path)) return next();
  if (COMMENTS_API(path)) return next();
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
