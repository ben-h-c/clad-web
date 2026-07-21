import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { loadImageDataUri, ogCacheKey, OG_VERSIONS, postStillUrl, OG } from "~/lib/ogCard";
import { labelDay, postsForDay } from "~/lib/calendarDays";
import { canonicalTopic } from "~/lib/topics";

export const prerender = false;

// Share card for a single day of the graded record (/day/YYYY-MM-DD/).
//
// GATE-SAFE BY CONSTRUCTION: this PNG is served to unauthenticated scrapers,
// so it carries only public facts — the date, how many reports ran, and the
// topics they covered. No letter grade, factuality score or lean value, the
// same rule the week card follows.
const PAPER = OG.paper;
const INK = OG.ink;
const MUTED = OG.muted;
const RED = OG.accent;

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

function markup(label: string, count: number, topics: string[], thumbs: string[]): string {
  const strip =
    thumbs.length > 0
      ? `<div style="display:flex;flex-direction:row;gap:10px;margin-top:20px;width:100%">
          ${thumbs
            .map(
              (u) =>
                `<div style="display:flex;flex:1;height:186px;overflow:hidden;border:3px solid ${INK};background:${INK}">
                  <img src="${u}" width="340" height="186" style="object-fit:cover;width:100%;height:186px;" />
                </div>`
            )
            .join("")}
        </div>`
      : `<div style="display:flex;gap:14px;margin-top:26px;flex-wrap:wrap">
          ${topics
            .slice(0, 3)
            .map(
              (t) =>
                `<div style="display:flex;border:3px solid ${INK};padding:10px 18px;font-size:20px;letter-spacing:2px;font-weight:700">${t.toUpperCase()}</div>`
            )
            .join("")}
        </div>`;

  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:44px 56px;border:1px solid ${OG.rule};border-radius:24px">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:30px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:18px;letter-spacing:3px;color:${MUTED};font-weight:700">THE GRADED RECORD</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:16px 0 20px"></div>
    <div style="display:flex;font-size:20px;letter-spacing:5px;color:${RED};font-weight:700">EVERY BROADCAST, FACT-CHECKED</div>
    <div style="display:flex;font-size:50px;font-weight:700;line-height:1.05;margin-top:10px">${label}</div>
    <div style="display:flex;font-size:28px;margin-top:12px;line-height:1.3;font-weight:700">${count} report${count === 1 ? "" : "s"} graded across ${topics.length} topic${topics.length === 1 ? "" : "s"}.</div>
    ${strip}
    <div style="display:flex;font-size:20px;color:${MUTED};margin-top:auto;letter-spacing:2px;font-weight:700">cladfacts.com · the day, on the record</div>
  </div>`;
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const date = String(params.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response(null, { status: 404 });
  if (Number.isNaN(new Date(`${date}T00:00:00Z`).valueOf())) return new Response(null, { status: 404 });

  const origin = new URL(request.url).origin;
  const cache = (caches as any).default as Cache;
  const cacheKey = ogCacheKey(new URL(request.url), "day", OG_VERSIONS.day);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const all = await getCollection("posts", (p) => !p.data.draft);
  const dayPosts = postsForDay(all, date);
  if (dayPosts.length === 0) return new Response(null, { status: 404 });

  const topics = [
    ...new Set(dayPosts.map((p) => canonicalTopic(p.data.topics?.[0] ?? "General"))),
  ];

  const thumbs: string[] = [];
  for (const p of dayPosts) {
    if (thumbs.length >= 3) break;
    const uri = await loadImageDataUri(postStillUrl(p), origin, { kind: "thumb" });
    if (uri) thumbs.push(uri);
  }

  const fonts = await loadFonts(origin);
  const img = new ImageResponse(markup(labelDay(date), dayPosts.length, topics, thumbs), {
    width: 1200,
    height: 630,
    fonts: fonts as any,
    format: "png",
  });
  const resp = new Response(img.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
  const cf = (locals as any)?.cfContext;
  if (cf?.waitUntil) cf.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
};
