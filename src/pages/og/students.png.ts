import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ImageResponse } from "workers-og";
import { OG_VERSIONS, ogCacheKey } from "~/lib/ogCard";

export const prerender = false;

// Share card for the /students/ campus hub. Static and ungated: the letter
// chips are the alphabet of the grading system, never real outlet grades.

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

function markup(): string {
  const letters = ["A", "B", "C", "D", "F"]
    .map(
      (l) =>
        `<div style="display:flex;border:3px solid ${INK};padding:12px 26px;font-size:40px;font-weight:700">${esc(l)}</div>`
    )
    .join("");
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:48px 64px;border:16px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:32px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${MUTED};font-weight:700">FOR STUDENTS · AGES 16–24</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:20px 0 26px"></div>
    <div style="display:flex;font-size:60px;font-weight:700;line-height:1.06;max-width:1040px;margin-top:8px">News with receipts</div>
    <div style="display:flex;font-size:28px;color:${MUTED};margin-top:20px;line-height:1.35;max-width:1000px">Letter grades on TV news. Sources you can open. A daily quiz.</div>
    <div style="display:flex;flex-direction:row;gap:16px;margin-top:34px">${letters}</div>
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%">
      <div style="display:flex;border:3px solid ${RED};color:${RED};padding:12px 24px;font-size:22px;letter-spacing:2px;font-weight:700">FREE ACCOUNT · FREE FOREVER</div>
      <div style="display:flex;font-size:22px;color:${MUTED};letter-spacing:2px">cladfacts.com/students</div>
    </div>
  </div>`;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const cache = (caches as any).default as Cache;
  // ogCacheKey drops the query string (?anything must not fan out satori
  // renders) and folds the version into a synthetic path segment.
  const cacheKey = ogCacheKey(new URL(request.url), "students", OG_VERSIONS.students);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const fonts = await loadFonts(new URL(request.url).origin);
  const img = new ImageResponse(markup(), {
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
