import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { buildCoverageBracket } from "~/lib/bracket";

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

function markup(names: string[], n: number): string {
  const line = names.slice(0, 6).map(esc).join("  ·  ") + (names.length > 6 ? "  ·  …" : "");
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:48px 64px;border:14px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:36px;font-weight:700;letter-spacing:8px">CLAD</div>
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${MUTED}">COVERAGE TOURNAMENT</div>
    </div>
    <div style="display:flex;width:100%;height:3px;background:${INK};margin:22px 0 28px"></div>
    <div style="display:flex;font-size:22px;letter-spacing:4px;color:${MUTED}">MARCH MADNESS · BY REPORT VOLUME</div>
    <div style="display:flex;font-size:52px;font-weight:700;line-height:1.08;margin-top:12px">Top ${n} by graded airtime</div>
    <div style="display:flex;font-size:24px;color:${MUTED};margin-top:20px;line-height:1.4;max-width:1000px">${line || "Filling as reports publish"}</div>
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%">
      <div style="display:flex;border:2px solid ${RED};color:${RED};padding:10px 22px;font-size:20px;letter-spacing:2px">NOT POLLS</div>
      <div style="display:flex;font-size:22px;color:${MUTED};letter-spacing:2px">cladfacts.com/bracket/coverage</div>
    </div>
  </div>`;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const cache = (caches as any).default as Cache;
  const cacheKey = new Request(new URL(request.url).toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const all = await getCollection("posts", (p) => !p.data.draft);
  const board = buildCoverageBracket(all, false);
  const fonts = await loadFonts(new URL(request.url).origin);
  const img = new ImageResponse(
    markup(
      board.field.map((p) => p.name),
      board.field.length
    ),
    { width: 1200, height: 630, fonts: fonts as any, format: "png" }
  );
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
