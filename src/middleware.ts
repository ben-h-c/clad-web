import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { checkBasicAuth, unauthorized } from "~/lib/auth";

// Agent endpoints authenticate with a bearer token inside the route, so they
// must bypass the editor basic-auth gate.
const AGENT_API = (path: string) => path.startsWith("/api/agent/");

// Public, unauthenticated endpoints (rate-limited inside the route). Readers
// submit grade/lean disputes here from article pages — no login.
const PUBLIC_API = (path: string) => path === "/api/flag";

const PROTECTED = (path: string) =>
  path === "/admin" ||
  path.startsWith("/admin/") ||
  path.startsWith("/api/");

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  if (AGENT_API(path)) return next();
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
