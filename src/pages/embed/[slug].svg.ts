import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { shortDate } from "~/lib/dateline";

export const prerender = false;

// Embeddable letterpress grade badge — the same sanctioned grade-exposure
// class as the /og/ share cards (a grade rendered in an image, never in
// anonymous HTML). Bloggers embed it with a plain <a><img></a> snippet; the
// image links readers back to the full report.
const PAPER = "#F5EDD9";
const INK = "#1A140D";
const MUTED = "#6E5E4D";
const RED = "#941A1A";

const VERDICT_LABELS: Record<string, string> = {
  true: "TRUE", "mostly-true": "MOSTLY TRUE", mixed: "MIXED",
  "mostly-false": "MOSTLY FALSE", false: "FALSE", unverified: "UNVERIFIED",
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const GET: APIRoute = async ({ params, request, locals }) => {
  // Dedupe repeat/query-varied hits in the Worker (same pattern as the /og/
  // routes), so we don't re-scan the whole posts collection per request. The
  // badge is content-addressed by path only, so drop the query from the key.
  const cache = (caches as any).default as Cache;
  const _u = new URL(request.url);
  const cacheKey = new Request(_u.origin + _u.pathname);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const post = (await getCollection("posts", (p) => !p.data.draft)).find((p) => p.id === params.slug);
  if (!post) return new Response(null, { status: 404 });
  const d = post.data;
  const isBroadcast = d.type === "broadcast";
  const badge = isBroadcast ? (d.letterGrade ?? "—") : (VERDICT_LABELS[d.verdict ?? ""] ?? "—");
  const badgeSize = badge.length <= 2 ? 44 : 15;
  const tone = /^[AB]/.test(badge) || badge === "TRUE" || badge === "MOSTLY TRUE" ? INK : /^C/.test(badge) || badge === "MIXED" ? MUTED : RED;
  const dated = shortDate(d.publishedAt);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="112" viewBox="0 0 320 112" role="img" aria-label="CladFacts grade ${esc(badge)} — graded ${esc(dated)}">
  <rect x="1" y="1" width="318" height="110" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>
  <rect x="6" y="6" width="308" height="100" fill="none" stroke="${INK}" stroke-width="0.75"/>
  <rect x="18" y="21" width="70" height="70" fill="none" stroke="${tone}" stroke-width="2.5" transform="rotate(-4 53 56)"/>
  <text x="53" y="${badge.length <= 2 ? 70 : 60}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" font-size="${badgeSize}" fill="${tone}" transform="rotate(-4 53 56)">${esc(badge)}</text>
  <text x="106" y="34" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" font-size="19" letter-spacing="3" fill="${INK}">CLADFACTS</text>
  <text x="106" y="52" font-family="Georgia, 'Times New Roman', serif" font-size="10" letter-spacing="1.5" fill="${MUTED}">${isBroadcast ? "ARTICLE GRADE" : "VERDICT"} · GRADED ${esc(dated.toUpperCase())}</text>
  <text x="106" y="72" font-family="Georgia, 'Times New Roman', serif" font-size="11" fill="${INK}">Fact-checked for accuracy &amp; bias.</text>
  <text x="106" y="92" font-family="Georgia, 'Times New Roman', serif" font-size="10" fill="${MUTED}">cladfacts.com — read the full report</text>
</svg>`;

  const resp = new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
  const cf = (locals as any)?.cfContext;
  if (cf?.waitUntil) cf.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
};
