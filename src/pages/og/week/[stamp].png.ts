import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { labelWeek, weekStartUTC } from "~/lib/trends";
import { OG_VERSIONS, ogCacheKey } from "~/lib/ogCard";

export const prerender = false;

// Share card for "The Week in Grades" (/week/<stamp>/). Content-addressed by
// the canonical Monday stamp, same bucketing as the page. Like the quiz card,
// it carries nothing gated — the report count and section names are an
// invitation, not a scoreboard (weekly grade/lean aggregates stay behind the
// registration wall; never add them here).
const PAPER = "#F5EDD9";
const INK = "#1A140D";
const MUTED = "#6E5E4D";
const RED = "#941A1A";

let fontsPromise: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[]> | null = null;
function loadFonts(origin: string) {
  if (!fontsPromise) {
    const get = async (file: string) => {
      const r = await env.ASSETS.fetch(new Request(new URL(file, origin)));
      return r.arrayBuffer();
    };
    fontsPromise = Promise.all([get("/fonts/playfair-400.woff"), get("/fonts/playfair-700.woff")]).then(
      ([w400, w700]) => [
        { name: "Playfair", data: w400, weight: 400 as const, style: "normal" as const },
        { name: "Playfair", data: w700, weight: 700 as const, style: "normal" as const },
      ]
    );
  }
  return fontsPromise;
}

// satori (workers-og) requires an explicit display:flex on EVERY div that has
// more than one child node — same convention as og/story/[slug].png.ts. Keep
// text divs single-line (no <br/>): a text+br+text div throws at render time
// and ships a 0-byte PNG.
function markup(weekLabel: string, year: number, count: number): string {
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:48px 64px;border:16px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:32px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${MUTED};font-weight:700">WEEK OF ${weekLabel.toUpperCase()}, ${year}</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:18px 0 28px"></div>
    <div style="display:flex;flex-direction:column;align-items:center;width:100%">
      <div style="display:flex;font-size:24px;letter-spacing:5px;color:${RED};font-weight:700">THE SCOREBOARD IS OUT</div>
      <div style="display:flex;font-size:60px;font-weight:700;text-align:center;line-height:1.05;margin-top:12px">The Week in Grades</div>
      <div style="display:flex;font-size:32px;margin-top:20px;line-height:1.3;font-weight:700;text-align:center">${count} reports graded. Who held up — and who spun?</div>
      <div style="display:flex;gap:14px;margin-top:30px">
        <div style="display:flex;border:3px solid ${INK};padding:10px 18px;font-size:20px;letter-spacing:2px;font-weight:700">BEST + WORST</div>
        <div style="display:flex;border:3px solid ${RED};color:${RED};padding:10px 18px;font-size:20px;letter-spacing:2px;font-weight:700">DISPUTED CLAIMS</div>
        <div style="display:flex;border:3px solid ${MUTED};color:${MUTED};padding:10px 18px;font-size:20px;letter-spacing:2px;font-weight:700">BLINDSPOTS</div>
      </div>
      <div style="display:flex;font-size:22px;color:${MUTED};margin-top:34px;letter-spacing:2px;font-weight:700">cladfacts.com/week · free every Sunday</div>
    </div>
  </div>`;
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const stamp = String(params.stamp ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return new Response(null, { status: 404 });
  const parsed = new Date(`${stamp}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) return new Response(null, { status: 404 });
  // Only the canonical Monday stamp exists (the page 301s everything else).
  const start = weekStartUTC(parsed);
  if (new Date(start).toISOString().slice(0, 10) !== stamp) return new Response(null, { status: 404 });
  const end = start + 7 * 86_400_000;

  const cache = (caches as any).default as Cache;
  // ogCacheKey drops the query string (?anything must not fan out satori
  // renders) and folds the version into a synthetic path segment.
  const cacheKey = ogCacheKey(new URL(request.url), "week", OG_VERSIONS.week);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const all = await getCollection("posts", (p) => !p.data.draft);
  const count = all.filter((p) => {
    const t = p.data.publishedAt.valueOf();
    return t >= start && t < end;
  }).length;
  if (count === 0) return new Response(null, { status: 404 });

  const fonts = await loadFonts(new URL(request.url).origin);
  const img = new ImageResponse(markup(labelWeek(start), new Date(start).getUTCFullYear(), count), {
    width: 1200,
    height: 630,
    fonts: fonts as any,
    format: "png",
  });
  const resp = new Response(img.body, {
    headers: {
      "Content-Type": "image/png",
      // Same policy as the quiz card; the post-deploy zone purge refreshes the
      // in-progress week's count on every publish.
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
  const cf = (locals as any)?.cfContext;
  if (cf?.waitUntil) cf.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
};
