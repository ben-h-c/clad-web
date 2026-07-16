import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ImageResponse } from "workers-og";
import { getLearnPage } from "~/lib/campus";

export const prerender = false;

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

function markup(kicker: string, title: string, line: string): string {
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:48px 64px;border:16px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:32px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${MUTED};font-weight:700">LEARN · ${esc(kicker.toUpperCase())}</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:20px 0 26px"></div>
    <div style="display:flex;font-size:22px;letter-spacing:4px;color:${RED};font-weight:700">STOP SCROLLING. LEARN THIS.</div>
    <div style="display:flex;font-size:52px;font-weight:700;line-height:1.06;max-width:1040px;margin-top:12px">${esc(title)}</div>
    <div style="display:flex;font-size:28px;color:${MUTED};margin-top:20px;line-height:1.35;max-width:1000px">${esc(line)}</div>
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%">
      <div style="display:flex;border:3px solid ${RED};color:${RED};padding:12px 24px;font-size:22px;letter-spacing:2px;font-weight:700">RECEIPTS, NOT VIBES</div>
      <div style="display:flex;font-size:22px;color:${MUTED};letter-spacing:2px">cladfacts.com/learn</div>
    </div>
  </div>`;
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const slug = String(params.slug ?? "");
  const page = getLearnPage(slug);
  if (!page) return new Response(null, { status: 404 });

  const cache = (caches as any).default as Cache;
  // Cache is content-addressed by path only (no route reads query params), so drop
  // the query string — otherwise ?anything busts the cache and re-runs satori.
  const _u = new URL(request.url);
  const cacheKey = new Request(_u.origin + _u.pathname);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const fonts = await loadFonts(new URL(request.url).origin);
  const line = page.description.length > 140 ? page.description.slice(0, 137) + "…" : page.description;
  const img = new ImageResponse(markup(page.kicker, page.title, line), {
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
