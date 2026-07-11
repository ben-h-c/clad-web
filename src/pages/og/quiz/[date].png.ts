import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ImageResponse } from "workers-og";

export const prerender = false;

// Share card for The Morning Quiz. Content-addressed by Eastern date so the
// card (and its edge-cache entry) rolls over with the quiz itself. Carries no
// post data and nothing gated — it's an invitation, not a scoreboard.
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

// satori (workers-og) requires an explicit display:flex on EVERY div with
// more than one child node, and treats text + <br/> + text as multiple
// children — the previous markup threw at render time and shipped a 0-byte
// PNG (found during the 2026-07-11 review verification). Same all-flex
// convention as og/story/[slug].png.ts.
function markup(dateLabel: string): string {
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:56px 72px;border:14px solid ${INK}">
    <div style="display:flex;flex-direction:column;align-items:center;width:100%">
      <div style="display:flex;font-size:24px;letter-spacing:10px;color:${MUTED}">FACT-CHECKING THE NEWS</div>
      <div style="display:flex;font-size:76px;font-weight:700;letter-spacing:6px;margin-top:6px">CLAD</div>
      <div style="display:flex;width:100%;height:3px;background:${INK};margin:18px 0 10px"></div>
      <div style="display:flex;font-size:22px;letter-spacing:4px;color:${MUTED}">${dateLabel.toUpperCase()}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;margin-top:52px">
      <div style="display:flex;font-size:66px;font-weight:700;text-align:center;line-height:1.1">The Morning Quiz</div>
      <div style="display:flex;font-size:32px;margin-top:26px;line-height:1.35">Five claims from this week's news.</div>
      <div style="display:flex;font-size:32px;line-height:1.35">Can you spot the spin?</div>
      <div style="display:flex;gap:18px;margin-top:34px">
        <div style="display:flex;border:2px solid ${INK};padding:8px 20px;font-size:22px;letter-spacing:2px">VERIFIED</div>
        <div style="display:flex;border:2px solid ${RED};color:${RED};padding:8px 20px;font-size:22px;letter-spacing:2px">DISPUTED</div>
        <div style="display:flex;border:2px solid ${MUTED};color:${MUTED};padding:8px 20px;font-size:22px;letter-spacing:2px">MISSING CONTEXT</div>
      </div>
      <div style="display:flex;font-size:26px;color:${MUTED};margin-top:38px;letter-spacing:2px">cladfacts.com/quiz — new at midnight Eastern</div>
    </div>
  </div>`;
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const date = String(params.date ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return new Response(null, { status: 404 });
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });

  const cache = (caches as any).default as Cache;
  const cacheKey = new Request(new URL(request.url).toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const fonts = await loadFonts(new URL(request.url).origin);
  const img = new ImageResponse(markup(label), { width: 1200, height: 630, fonts: fonts as any, format: "png" });
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
