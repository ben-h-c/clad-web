import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { buildRaceBoard } from "~/lib/bracket";

export const prerender = false;

// Public race-board share card — offices + heat only (no gated leaders).

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

function markup(lines: string[], n: number): string {
  const body = lines.slice(0, 5).map((l) => esc(l)).join("   ·   ");
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:48px 64px;border:14px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:36px;font-weight:700;letter-spacing:8px">CLAD</div>
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${MUTED}">MIDTERMS 2026</div>
    </div>
    <div style="display:flex;width:100%;height:3px;background:${INK};margin:22px 0 28px"></div>
    <div style="display:flex;font-size:22px;letter-spacing:4px;color:${MUTED}">CLASS II SENATE · MIDTERM GOVERNORS</div>
    <div style="display:flex;font-size:52px;font-weight:700;line-height:1.08;margin-top:12px">On the 2026 ballot</div>
    <div style="display:flex;font-size:28px;margin-top:20px;line-height:1.35">${n} races · coverage grades, not polls</div>
    <div style="display:flex;font-size:24px;color:${MUTED};margin-top:16px;line-height:1.4;max-width:1020px">${body}</div>
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%">
      <div style="display:flex;border:2px solid ${RED};color:${RED};padding:10px 22px;font-size:22px;letter-spacing:2px">WHOSE COVERAGE GRADES?</div>
      <div style="display:flex;font-size:24px;color:${MUTED};letter-spacing:2px">cladfacts.com/bracket</div>
    </div>
  </div>`;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const cache = (caches as any).default as Cache;
  const cacheKey = new Request(new URL(request.url).toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const all = await getCollection("posts", (p) => !p.data.draft);
  const board = buildRaceBoard(all, false);
  const lines = board.cards
    .filter((c) => c.heat > 0)
    .slice(0, 6)
    .map((c) => c.def.office);

  const fonts = await loadFonts(new URL(request.url).origin);
  const img = new ImageResponse(markup(lines, board.cards.length), {
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
