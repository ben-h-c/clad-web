import { defineMiddleware } from "astro:middleware";
import type { APIContext, MiddlewareNext } from "astro";
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
  // Home “Keep reading” infinite feed pages (grades gated inside the route).
  path === "/api/home-more" ||
  path.startsWith("/api/home-more/") ||
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
  // Public ballot share cards (summary only; no auth secrets).
  path.startsWith("/api/ballot/") ||
  // Subscribable .ics of the scheduled daybook (home calendar → "Ahead").
  // Carries only scheduled events — no grade, factuality or lean values —
  // so it is public and shared-cacheable by construction.
  path === "/api/calendar.ics" ||
  // Privacy-first first-party analytics (aggregate page/video events).
  // No auth; the route drops bots, DNT/GPC, and stores no PII.
  path === "/api/analytics/collect" ||
  path === "/api/analytics/collect/" ||
  // Clad Studio cloud relay (iPad ↔ Mac over internet). Bearer token
  // checked inside each route — not editor basic-auth.
  path.startsWith("/api/studio/");

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
  path.startsWith("/goodbye/");

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
/**
 * Cache API hits (and some streamed bodies) expose immutable Headers.
 * Mutating them throws "Can't modify immutable headers" → empty 500.
 * Always rewrite onto a fresh Headers object when a set fails.
 */
function withHeaders(response: Response, mutate: (h: Headers) => void): Response {
  try {
    mutate(response.headers);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    mutate(headers);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

/** Security headers for HTML (and most document responses). Embed SVG must stay frameable. */
function applySecurityHeaders(path: string, response: Response) {
  const isEmbed = path.startsWith("/embed/");
  // Enforcing CSP (inline scripts used site-wide; Stripe / Turnstile / YouTube allowed).
  // Embeds intentionally omit frame-ancestors so third-party sites can iframe the SVG.
  const csp = isEmbed
    ? "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'"
    : [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://challenges.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://api.stripe.com https://api.x.ai https://*.cladfacts.com https://cladfacts.com https://*.workers.dev https://accounts.google.com https://appleid.apple.com",
        "frame-src 'self' https://js.stripe.com https://challenges.cloudflare.com https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self' https://accounts.google.com https://appleid.apple.com",
        "object-src 'none'",
        "upgrade-insecure-requests",
      ].join("; ");
  return withHeaders(response, (h) => {
    h.set("X-Content-Type-Options", "nosniff");
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
    // HSTS: edge already terminates TLS; skip in-app HSTS to avoid conflicting policies.
    if (!isEmbed) {
      h.set("X-Frame-Options", "SAMEORIGIN");
    }
    h.set("Content-Security-Policy", csp);
    if (env.ENVIRONMENT === "staging") h.set("X-Robots-Tag", "noindex, nofollow");
  });
}

function applyCachePolicy(context: { request: Request }, path: string, response: Response) {
  if (env.ENVIRONMENT === "staging") {
    return applySecurityHeaders(
      path,
      withHeaders(response, (h) => {
        h.set("Cache-Control", "private, no-store");
      })
    );
  }
  const hasSession = (context.request.headers.get("cookie") ?? "").includes("session_token");
  const next = withHeaders(response, (h) => {
    // Honor route-level private/no-store (e.g. post pages that vary by tier).
    const existing = h.get("Cache-Control") || "";
    if (existing.includes("no-store") || existing.includes("private")) {
      // keep
    } else if (hasSession || response.headers.has("set-cookie") || UNCACHEABLE_PAGE(path)) {
      h.set("Cache-Control", "private, no-store");
    } else if (LOW_TTL_PAGE(path)) {
      h.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
    } else if (path === "/" || path === "") {
      // Anon home is the hottest back-nav target.
      h.set("Cache-Control", "public, s-maxage=90, stale-while-revalidate=600");
    } else if (path.startsWith("/posts/")) {
      // Post HTML is large + CPU-heavy; short edge TTL for anon only.
      h.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    } else {
      h.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    }
  });
  return applySecurityHeaders(path, next);
}

// Apple universal-links association file. Served straight from middleware
// because Apple requires it at EXACTLY /.well-known/apple-app-site-association
// over https with NO redirect and valid JSON — and the trailing-slash
// normalizer below would otherwise 301 this extensionless path. Team
// R7AV32BX6D + bundle com.bencody.cladfacts (see cladfacts-ios). Every content
// path opens in the app; api / auth / account / admin stay in Safari so
// sign-in callbacks and the editor console are never hijacked.
/** `/go/posts/x/` → `/posts/x/`. Null if this is not an email click-through. */
function destFromGoPath(path: string): string | null {
  if (path === "/go" || path === "/go/") return "/";
  if (!path.startsWith("/go/")) return null;
  const dest = path.slice(3); // keep the slash: /go/posts/x/ → /posts/x/
  return dest.startsWith("/") ? dest : `/${dest}`;
}

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
          { "/": "/go", exclude: true },
          { "/": "/go/*", exclude: true },
          // Do not claim the rest of the site. Mail/Yahoo open the iOS app
          // for any included cladfacts.com path and the shipped binary lands
          // on home. Widget/push use cladfacts:// and native routing.
          { "/": "/*", exclude: true },
        ],
      },
    ],
  },
});

async function handleRequest(context: APIContext, next: MiddlewareNext) {
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

  // Email click-through: serve the real page at /go/... so a 302 to /posts/
  // cannot bounce into the iOS app. Browser URL stays /go/....
  const goDest = destFromGoPath(path);
  if (goDest != null) {
    const res = await context.rewrite(goDest + context.url.search);
    return withHeaders(res, (h) => {
      h.set("X-Robots-Tag", "noindex, nofollow");
    });
  }
  if (AGENT_API(path)) return next();
  if (USER_API(path)) return next();
  if (COMMENTS_API(path)) return next();
  if (STRIPE_API(path)) return next();
  if (PUBLIC_API(path)) {
    // Still apply nosniff on public API responses. Cache API hits return
    // immutable headers — re-wrap via withHeaders when set would throw.
    const res = await next();
    return withHeaders(res, (h) => {
      h.set("X-Content-Type-Options", "nosniff");
      if (env.ENVIRONMENT === "staging") h.set("X-Robots-Tag", "noindex, nofollow");
    });
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

  // Soft rate-limit failed admin basic-auth attempts per IP (shared credential surface).
  const adminIp =
    context.request.headers.get("CF-Connecting-IP") ||
    context.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  const ok = checkBasicAuth(
    context.request.headers.get("authorization"),
    env.ADMIN_USER,
    env.ADMIN_PASSWORD
  );
  if (!ok) {
    if (env.FACTCHECK_LIMITER) {
      const { success } = await env.FACTCHECK_LIMITER.limit({ key: `admin-auth:${adminIp}` });
      if (!success) {
        return new Response("Too many attempts. Try again later.", {
          status: 429,
          headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
        });
      }
    }
    return unauthorized();
  }

  return next();
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (env.ENVIRONMENT !== "staging") {
    return handleRequest(context, next);
  }

  const {
    runWithStageView,
    parseStageView,
    parseStageSkin,
    STAGE_VIEW_COOKIE,
    STAGE_SKIN_COOKIE,
  } = await import("~/lib/access");

  const qView = context.url.searchParams.get("view");
  if (qView === "live") {
    context.cookies.delete(STAGE_VIEW_COOKIE, { path: "/" });
  }
  let view =
    qView === "live"
      ? null
      : parseStageView(qView) ?? parseStageView(context.cookies.get(STAGE_VIEW_COOKIE)?.value);
  // Clad Studio is a design tool, not the reader app. With no explicit
  // Guest/Live choice, show the signed-in product so taps are not a register wall.
  const ua = context.request.headers.get("user-agent") || "";
  if (view == null && qView !== "live" && /CladStudio/i.test(ua)) {
    view = "signed";
    context.cookies.set(STAGE_VIEW_COOKIE, "signed", {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
    });
  }

  const qSkin = context.url.searchParams.get("skin");
  if (qSkin === "off" || qSkin === "current") {
    context.cookies.delete(STAGE_SKIN_COOKIE, { path: "/" });
  } else {
    const skin = parseStageSkin(qSkin);
    if (skin) {
      context.cookies.set(STAGE_SKIN_COOKIE, skin, {
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
        sameSite: "lax",
      });
    }
  }
  if (qView === "signed" || qView === "anon") {
    context.cookies.set(STAGE_VIEW_COOKIE, qView, {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
    });
  }

  const res = await runWithStageView(view, () => handleRequest(context, next));
  return withHeaders(res, (h) => {
    const ct = h.get("content-type") || "";
    if (ct.includes("text/html") || ct.includes("application/json")) {
      h.set("Cache-Control", "private, no-store");
    }
  });
});
