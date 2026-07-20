import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { labelWeek, weekStartUTC } from "~/lib/trends";
import { loadImageDataUri, ogCacheKey, OG_VERSIONS, postStillUrl, OG } from "~/lib/ogCard";

export const prerender = false;

// Share card for "The Week in Grades". v2: collage of report stills from the week.
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

function markup(weekLabel: string, year: number, count: number, thumbs: string[]): string {
  const strip =
    thumbs.length > 0
      ? `<div style="display:flex;flex-direction:row;gap:10px;margin-top:22px;width:100%">
          ${thumbs
            .map(
              (u) =>
                `<div style="display:flex;flex:1;height:200px;overflow:hidden;border:3px solid ${INK};background:${INK}">
                  <img src="${u}" width="340" height="200" style="object-fit:cover;width:100%;height:200px;" />
                </div>`
            )
            .join("")}
        </div>`
      : `<div style="display:flex;gap:14px;margin-top:30px">
          <div style="display:flex;border:3px solid ${INK};padding:10px 18px;font-size:20px;letter-spacing:2px;font-weight:700">BEST + WORST</div>
          <div style="display:flex;border:3px solid ${RED};color:${RED};padding:10px 18px;font-size:20px;letter-spacing:2px;font-weight:700">DISPUTED CLAIMS</div>
          <div style="display:flex;border:3px solid ${MUTED};color:${MUTED};padding:10px 18px;font-size:20px;letter-spacing:2px;font-weight:700">BLINDSPOTS</div>
        </div>`;

  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:44px 56px;border:1px solid ${OG.rule};border-radius:24px">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:30px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:18px;letter-spacing:3px;color:${MUTED};font-weight:700">WEEK OF ${weekLabel.toUpperCase()}, ${year}</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:16px 0 22px"></div>
    <div style="display:flex;font-size:20px;letter-spacing:5px;color:${RED};font-weight:700">THE SCOREBOARD IS OUT</div>
    <div style="display:flex;font-size:52px;font-weight:700;line-height:1.05;margin-top:10px">The Week in Grades</div>
    <div style="display:flex;font-size:28px;margin-top:14px;line-height:1.3;font-weight:700">${count} reports graded. Who held up — and who spun?</div>
    ${strip}
    <div style="display:flex;font-size:20px;color:${MUTED};margin-top:auto;letter-spacing:2px;font-weight:700">cladfacts.com/week · free every Sunday</div>
  </div>`;
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const stamp = String(params.stamp ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return new Response(null, { status: 404 });
  const parsed = new Date(`${stamp}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) return new Response(null, { status: 404 });
  const start = weekStartUTC(parsed);
  if (new Date(start).toISOString().slice(0, 10) !== stamp) return new Response(null, { status: 404 });
  const end = start + 7 * 86_400_000;

  const origin = new URL(request.url).origin;
  const cache = (caches as any).default as Cache;
  const cacheKey = ogCacheKey(new URL(request.url), "week", OG_VERSIONS.week);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const all = await getCollection("posts", (p) => !p.data.draft);
  const weekPosts = all
    .filter((p) => {
      const t = p.data.publishedAt.valueOf();
      return t >= start && t < end;
    })
    .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
  if (weekPosts.length === 0) return new Response(null, { status: 404 });

  const thumbs: string[] = [];
  for (const p of weekPosts) {
    if (thumbs.length >= 3) break;
    const uri = await loadImageDataUri(postStillUrl(p), origin, { kind: "thumb" });
    if (uri) thumbs.push(uri);
  }

  const fonts = await loadFonts(origin);
  const img = new ImageResponse(
    markup(labelWeek(start), new Date(start).getUTCFullYear(), weekPosts.length, thumbs),
    {
      width: 1200,
      height: 630,
      fonts: fonts as any,
      format: "png",
    }
  );
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
