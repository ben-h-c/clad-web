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
  // Server-side site search — public; the route nulls grades/lean for
  // anonymous requests (any signed-in account gets full access).
  path === "/api/search" ||
  path === "/api/posts.json" ||
  path.startsWith("/api/posts/") ||
  // iOS push-token (un)registration. Anonymous devices may opt into
  // breaking-news alerts; the route reads any session cookie itself.
  path.startsWith("/api/push/") ||
  // iOS in-app purchase: /api/iap/apple reads the session cookie itself;
  // /api/iap/apple/notifications is Apple's server webhook (no session).
  path.startsWith("/api/iap/") ||
  // Public newsletter signup + confirm/unsubscribe links. Rate-limited and
  // double-opt-in inside the route.
  path === "/api/subscribe" ||
  // Same-origin Wikimedia portrait proxy for politician cards / race board.
  path.startsWith("/api/politician-photo/") ||
  // Subscribable .ics of the scheduled daybook (home calendar → "Ahead").
  // Carries only scheduled events — no grade, factuality or lean values —
  // so it is public and shared-cacheable by construction.
  path === "/api/calendar.ics";

const PROTECTED = (path: string) =>
  path === "/admin" ||
  path.startsWith("/admin/") ||
  path.startsWith("/api/");

// Pages whose HTML must never be shared through a cache even for anonymous
// visitors (auth flows, per-user surfaces, editor utilities).
const UNCACHEABLE_PAGE = (path: string) =>
  path.startsWith("/account/") ||
  path.startsWith("/login/") ||
  path.startsWith("/register/") ||
  path.startsWith("/verified/") ||
  path.startsWith("/goodbye/") ||
  path.startsWith("/recent/");

// Copy-critical marketing pages: pricing and tier copy must not sit in the
// shared cache for five minutes after a wording change, so they get a 60s TTL.
const LOW_TTL_PAGE = (path: string) =>
  path === "/upgrade" ||
  path === "/upgrade/" ||
  path === "/how-it-works" ||
  path === "/how-it-works/";

/**
 * Cache policy for HTML pages. Anonymous GETs are shared-cacheable for five
 * minutes (one minute for copy-critical marketing pages;
 * stale-while-revalidate covers the gap between publishes) so the edge can
 * serve fast, fresh pages; the deploy pipeline purges the zone so nothing
 * outlives a release. Any request carrying a session cookie — or any
 * response that sets one — stays private: page HTML varies by tier
 * (grades/lean render for full-access readers) and must never be stored in a
 * shared cache.
 */
/** Security headers for HTML (and most document responses). Embed SVG must stay frameable. */
function applySecurityHeaders(path: string, response: Response) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // HSTS: edge already terminates TLS; skip in-app HSTS to avoid conflicting policies.
  const isEmbed = path.startsWith("/embed/");
  if (!isEmbed) {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
  }
  // Report-only CSP first — allows measuring breakage without blocking OAuth/inline.
  // Embeds intentionally omit frame-ancestors so third-party sites can iframe the SVG.
  const csp = isEmbed
    ? "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'"
    : [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://challenges.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://api.stripe.com https://*.cladfacts.com https://cladfacts.com",
        "frame-src 'self' https://js.stripe.com https://challenges.cloudflare.com https://www.youtube.com https://youtube.com",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join("; ");
  response.headers.set("Content-Security-Policy-Report-Only", csp);
  return response;
}

function applyCachePolicy(context: { request: Request }, path: string, response: Response) {
  const hasSession = (context.request.headers.get("cookie") ?? "").includes("session_token");
  if (hasSession || response.headers.has("set-cookie") || UNCACHEABLE_PAGE(path)) {
    response.headers.set("Cache-Control", "private, no-store");
  } else if (LOW_TTL_PAGE(path)) {
    response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
  } else {
    response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  }
  applySecurityHeaders(path, response);
  return response;
}

// Apple universal-links association file. Served straight from middleware
// because Apple requires it at EXACTLY /.well-known/apple-app-site-association
// over https with NO redirect and valid JSON — and the trailing-slash
// normalizer below would otherwise 301 this extensionless path. Team
// R7AV32BX6D + bundle com.bencody.cladfacts (see cladfacts-ios). Every content
// path opens in the app; api / auth / account / admin stay in Safari so
// sign-in callbacks and the editor console are never hijacked.
const APPLE_APP_SITE_ASSOCIATION = JSON.stringify({
  applinks: {
    details: [
      {
        appIDs: ["R7AV32BX6D.com.bencody.cladfacts"],
        components: [
          { "/": "/api/*", exclude: true },
          { "/": "/account/*", exclude: true },
          { "/": "/login/*", exclude: true },
          { "/": "/register/*", exclude: true },
          { "/": "/reset-password/*", exclude: true },
          { "/": "/admin/*", exclude: true },
          { "/": "/*" },
        ],
      },
    ],
  },
});

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const method = context.request.method;

  if (path === "/.well-known/apple-app-site-association") {
    return new Response(APPLE_APP_SITE_ASSOCIATION, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

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
  if (path === "/news-sitemap.xml/") return context.redirect("/news-sitemap.xml", 301);
  if (AGENT_API(path)) return next();
  if (USER_API(path)) return next();
  if (COMMENTS_API(path)) return next();
  if (STRIPE_API(path)) return next();
  if (PUBLIC_API(path)) {
    // Still apply nosniff / frame policy on public API JSON responses.
    const res = await next();
    res.headers.set("X-Content-Type-Options", "nosniff");
    return res;
  }
  if (!PROTECTED(path)) {
    // HTML pages only: API routes and file-like paths set their own headers.
    if ((method === "GET" || method === "HEAD") && !/\.[a-z0-9]+$/i.test(path)) {
      return applyCachePolicy(context, path, await next());
    }
    const res = await next();
    applySecurityHeaders(path, res);
    return res;
  }

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
