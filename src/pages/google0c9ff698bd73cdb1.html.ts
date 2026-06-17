// Google Search Console verification. Served as an SSR route (not a static
// public/ file) so Cloudflare returns a direct 200 instead of redirecting
// /…​.html to the extensionless URL, which Google's file check can reject.
export const prerender = false;

export const GET = () =>
  new Response("google-site-verification: google0c9ff698bd73cdb1.html\n", {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
