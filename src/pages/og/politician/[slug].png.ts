import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { findPolitician } from "~/lib/politicians";

export const prerender = false;

// Share card for /politicians/[slug]/. Public only: name, race, report count.
// Never put avg grade / lean / factuality here — those stay behind the free
// account wall on the HTML page (same rule as the week OG card).

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

function markup(name: string, race: string | null, count: number): string {
  const reports = `${count} graded report${count === 1 ? "" : "s"}`;
  const raceLine = race ? race.toUpperCase() : "FACT-CHECK REPORT CARD";
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:48px 64px;border:14px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:36px;font-weight:700;letter-spacing:8px">CLAD</div>
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${MUTED}">POLITICIAN REPORT CARD</div>
    </div>
    <div style="display:flex;width:100%;height:3px;background:${INK};margin:22px 0 28px"></div>
    <div style="display:flex;font-size:22px;letter-spacing:4px;color:${MUTED}">${esc(raceLine)}</div>
    <div style="display:flex;font-size:64px;font-weight:700;line-height:1.1;margin-top:16px;max-width:1000px">${esc(name)}</div>
    <div style="display:flex;font-size:32px;margin-top:28px;line-height:1.35">${esc(reports)} on CladFacts</div>
    <div style="display:flex;font-size:28px;color:${MUTED};margin-top:10px;line-height:1.35">How the coverage held up — free with an account</div>
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%">
      <div style="display:flex;border:2px solid ${RED};color:${RED};padding:10px 22px;font-size:22px;letter-spacing:2px">SEE EVERY GRADE</div>
      <div style="display:flex;font-size:24px;color:${MUTED};letter-spacing:2px">cladfacts.com/politicians</div>
    </div>
  </div>`;
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const slug = String(params.slug ?? "").trim();
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return new Response(null, { status: 404 });

  const cache = (caches as any).default as Cache;
  const cacheKey = new Request(new URL(request.url).toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const all = await getCollection("posts", (p) => !p.data.draft);
  const pol = findPolitician(all, slug);
  if (!pol) return new Response(null, { status: 404 });

  const fonts = await loadFonts(new URL(request.url).origin);
  const img = new ImageResponse(markup(pol.name, pol.race ?? null, pol.appearances.length), {
    width: 1200,
    height: 630,
    fonts: fonts as any,
    format: "png",
  });
  const resp = new Response(img.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
  const cf = (locals as any)?.cfContext;
  if (cf?.waitUntil) cf.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
};
