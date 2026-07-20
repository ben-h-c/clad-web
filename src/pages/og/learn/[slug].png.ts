import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ImageResponse } from "workers-og";
import { getLearnPage, type LearnPage } from "~/lib/campus";
import { loadAssetDataUri, OG_VERSIONS, ogCacheKey, OG } from "~/lib/ogCard";

export const prerender = false;

// v3: owned product screenshot so learn unfurls aren't text-only.

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

const esc = (s: unknown) => String(s ?? "").replace(/[<>&]/g, "");

function markup(page: LearnPage, line: string, photo: string | null): string {
  const eyebrow = page.cardEyebrow ?? "FIELD GUIDE";
  const chips = (page.cardChips ?? [])
    .map(
      (c) =>
        `<div style="display:flex;border:1px solid ${OG.rule};border-radius:12px;padding:8px 14px;font-size:18px;letter-spacing:2px;font-weight:700">${esc(c)}</div>`
    )
    .join("");
  const chipRow = chips
    ? `<div style="display:flex;flex-direction:row;flex-wrap:wrap;gap:10px;margin-top:18px;max-width:640px">${chips}</div>`
    : "";
  const photoBlock = photo
    ? `<div style="display:flex;width:320px;height:460px;overflow:hidden;border:1px solid ${OG.rule};border-radius:16px;background:${INK};flex-shrink:0;margin-left:28px">
        <img src="${photo}" width="320" height="460" style="object-fit:cover;object-position:top center;width:320px;height:460px;" />
      </div>`
    : "";
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:40px 48px;border:1px solid ${OG.rule};border-radius:24px">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:28px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:18px;letter-spacing:3px;color:${MUTED};font-weight:700">LEARN · ${esc(page.kicker.toUpperCase())}</div>
    </div>
    <div style="display:flex;width:100%;height:3px;background:${OG.accent};border-radius:999px;margin:14px 0 20px"></div>
    <div style="display:flex;flex-direction:row;flex:1;min-height:0;width:100%">
      <div style="display:flex;flex-direction:column;flex:1;min-width:0">
        <div style="display:flex;font-size:18px;letter-spacing:4px;color:${RED};font-weight:700">${esc(eyebrow.toUpperCase())}</div>
        <div style="display:flex;font-size:46px;font-weight:700;line-height:1.06;max-width:700px;margin-top:10px">${esc(page.title)}</div>
        <div style="display:flex;font-size:24px;color:${MUTED};margin-top:16px;line-height:1.35;max-width:680px">${esc(line)}</div>
        ${chipRow}
        <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%">
          <div style="display:flex;border:0;background:${OG.accentSoft};border-radius:999px;color:${RED};padding:10px 20px;font-size:18px;letter-spacing:2px;font-weight:700">RECEIPTS, NOT VIBES</div>
          <div style="display:flex;font-size:18px;color:${MUTED};letter-spacing:2px">cladfacts.com/learn</div>
        </div>
      </div>
      ${photoBlock}
    </div>
  </div>`;
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const slug = String(params.slug ?? "");
  const page = getLearnPage(slug);
  if (!page) return new Response(null, { status: 404 });

  const origin = new URL(request.url).origin;
  const cache = (caches as any).default as Cache;
  const cacheKey = ogCacheKey(new URL(request.url), "learn", OG_VERSIONS.learn);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // Site-owned tour screenshots (not third-party news photos).
  const tour =
    slug.includes("bias") || slug.includes("lean")
      ? "/tour/3-bias.png"
      : slug.includes("quiz") || slug.includes("vote")
        ? "/tour/1-feed.png"
        : "/tour/2-report.png";
  const photo = await loadAssetDataUri(env.ASSETS, tour, origin);

  const fonts = await loadFonts(origin);
  const line = page.description.length > 140 ? page.description.slice(0, 137) + "…" : page.description;
  const img = new ImageResponse(markup(page, line, photo), {
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
