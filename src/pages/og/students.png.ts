import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ImageResponse } from "workers-og";
import { loadAssetDataUri, OG_VERSIONS, ogCacheKey } from "~/lib/ogCard";

export const prerender = false;

// Share card for /students/. v2: owned product screenshot so unfurls have a photo.

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

const esc = (s: unknown) => String(s ?? "").replace(/[<>&]/g, "");

function markup(photo: string | null): string {
  const letters = ["A", "B", "C", "D", "F"]
    .map(
      (l) =>
        `<div style="display:flex;border:3px solid ${INK};padding:10px 22px;font-size:34px;font-weight:700">${esc(l)}</div>`
    )
    .join("");
  const photoBlock = photo
    ? `<div style="display:flex;width:300px;height:440px;overflow:hidden;border:4px solid ${INK};background:${INK};flex-shrink:0;margin-left:32px">
        <img src="${photo}" width="300" height="440" style="object-fit:cover;object-position:top center;width:300px;height:440px;" />
      </div>`
    : "";
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:40px 48px;border:16px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:28px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:18px;letter-spacing:3px;color:${MUTED};font-weight:700">FOR STUDENTS · AGES 16–24</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:14px 0 20px"></div>
    <div style="display:flex;flex-direction:row;flex:1;width:100%;min-height:0">
      <div style="display:flex;flex-direction:column;flex:1;min-width:0">
        <div style="display:flex;font-size:52px;font-weight:700;line-height:1.06;max-width:720px;margin-top:4px">News with receipts</div>
        <div style="display:flex;font-size:26px;color:${MUTED};margin-top:16px;line-height:1.35;max-width:680px">Letter grades on TV news. Sources you can open. A daily quiz.</div>
        <div style="display:flex;flex-direction:row;gap:12px;margin-top:28px">${letters}</div>
        <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%">
          <div style="display:flex;border:3px solid ${RED};color:${RED};padding:10px 20px;font-size:18px;letter-spacing:2px;font-weight:700">FREE ACCOUNT · FREE FOREVER</div>
          <div style="display:flex;font-size:18px;color:${MUTED};letter-spacing:2px">cladfacts.com/students</div>
        </div>
      </div>
      ${photoBlock}
    </div>
  </div>`;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const origin = new URL(request.url).origin;
  const cache = (caches as any).default as Cache;
  const cacheKey = ogCacheKey(new URL(request.url), "students", OG_VERSIONS.students);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const photo = await loadAssetDataUri(env.ASSETS, "/tour/1-feed.png", origin);
  const fonts = await loadFonts(origin);
  const img = new ImageResponse(markup(photo), {
    width: 1200,
    height: 630,
    fonts: fonts as any,
    format: "png",
  });
  const resp = new Response(img.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
  const cf = (locals as any)?.cfContext;
  if (cf?.waitUntil) cf.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
};
