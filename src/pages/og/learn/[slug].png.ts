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
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:48px 64px;border:14px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:36px;font-weight:700;letter-spacing:8px">CLAD</div>
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${MUTED}">LEARN · ${esc(kicker.toUpperCase())}</div>
    </div>
    <div style="display:flex;width:100%;height:3px;background:${INK};margin:22px 0 28px"></div>
    <div style="display:flex;font-size:56px;font-weight:700;line-height:1.08;max-width:1040px">${esc(title)}</div>
    <div style="display:flex;font-size:28px;color:${MUTED};margin-top:24px;line-height:1.35;max-width:1000px">${esc(line)}</div>
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%">
      <div style="display:flex;border:2px solid ${RED};color:${RED};padding:10px 22px;font-size:22px;letter-spacing:2px">RECEIPTS, NOT VIBES</div>
      <div style="display:flex;font-size:24px;color:${MUTED};letter-spacing:2px">cladfacts.com/learn</div>
    </div>
  </div>`;
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const slug = String(params.slug ?? "");
  const page = getLearnPage(slug);
  if (!page) return new Response(null, { status: 404 });

  const cache = (caches as any).default as Cache;
  const cacheKey = new Request(new URL(request.url).toString());
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
