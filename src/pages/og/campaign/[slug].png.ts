/**
 * Campaign Studio share card — OG image for owner marketing.
 * Flexbox only, inline styles, no external images.
 * Cache key folds campaign.updatedAt so edits bust Worker cache.
 * Export renderCampaignCard for Phase-3 in-process Bluesky (never ASSETS.fetch).
 */
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ImageResponse } from "workers-og";
import { getCampaign, type Campaign, type CampaignCard } from "~/lib/campaign";
import { clip, loadAssetDataUri, ogCacheKey, OG_VERSIONS, OG } from "~/lib/ogCard";

export const prerender = false;

// v2: owned product screenshot so campaign unfurls aren't text-only.

const PAPER = OG.paper;
const INK = OG.ink;
const MUTED = OG.muted;
const RED = OG.accent;

type FontFace = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

let fontsPromise: Promise<FontFace[]> | null = null;

async function loadFonts(origin: string): Promise<FontFace[]> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      try {
        const get = async (file: string) => {
          const r = await env.ASSETS.fetch(new Request(new URL(file, origin)));
          if (!r.ok) throw new Error(`font ${file} ${r.status}`);
          return r.arrayBuffer();
        };
        const [w400, w700] = await Promise.all([
          get("/fonts/playfair-400.woff"),
          get("/fonts/playfair-700.woff"),
        ]);
        return [
          { name: "Playfair", data: w400, weight: 400 as const, style: "normal" as const },
          { name: "Playfair", data: w700, weight: 700 as const, style: "normal" as const },
        ];
      } catch {
        return [];
      }
    })();
  }
  return fontsPromise;
}

const esc = (s: unknown) => String(s ?? "").replace(/[<>&]/g, "");

function displayPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const clean = p === "/" ? "" : p.replace(/\/$/, "");
  return `cladfacts.com${clean}`;
}

function markup(card: CampaignCard, photo: string | null): string {
  const kicker = esc(clip(card.kicker || "CLADFACTS", 40).toUpperCase());
  const headline = esc(clip(card.headline || "CladFacts", photo ? 70 : 90));
  const subhead = esc(clip(card.subhead || "Graded TV-news report cards.", photo ? 100 : 120));
  const stat = esc(clip(card.statLine || "Fact-checked. Sourced. Graded.", 80));
  const cta = esc(clip(card.ctaLabel || "Read at CladFacts", 28).toUpperCase());
  const url = esc(displayPath(card.ctaUrl || "/"));
  const photoBlock = photo
    ? `<div style="display:flex;width:300px;height:440px;overflow:hidden;border:1px solid ${OG.rule};border-radius:18px;background:${INK};flex-shrink:0;margin-left:28px">
        <img src="${photo}" width="300" height="440" style="object-fit:cover;object-position:top center;width:300px;height:440px;" />
      </div>`
    : "";

  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair,Georgia,serif;padding:36px 40px;">
    <div style="display:flex;flex-direction:column;flex:1;background:${OG.card};border:1px solid ${OG.rule};border-radius:24px;padding:28px 36px;">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:26px;font-weight:700;letter-spacing:-0.5px;color:${INK}">CladFacts</div>
      <div style="display:flex;font-size:13px;letter-spacing:1px;color:${RED};font-weight:700;background:${OG.accentSoft};padding:6px 14px;border-radius:999px">${kicker}</div>
    </div>
    <div style="display:flex;flex-direction:row;flex:1;width:100%;min-height:0;margin-top:22px">
      <div style="display:flex;flex-direction:column;flex:1;min-width:0">
        <div style="display:flex;font-size:44px;font-weight:700;line-height:1.1;max-width:760px;color:${INK}">${headline}</div>
        <div style="display:flex;font-size:24px;margin-top:14px;line-height:1.35;font-weight:600;max-width:720px;color:${MUTED}">${subhead}</div>
        <div style="display:flex;font-size:20px;color:${MUTED};margin-top:12px;line-height:1.4;max-width:720px">${stat}</div>
        <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%">
          <div style="display:flex;background:${OG.accent};border-radius:999px;color:#FFFFFF;padding:12px 22px;font-size:16px;letter-spacing:1px;font-weight:700">${cta}</div>
          <div style="display:flex;font-size:16px;color:${MUTED};font-weight:600">${url}</div>
        </div>
      </div>
      ${photoBlock}
    </div>
    </div>
  </div>`;
}

function fallbackMarkup(photo: string | null): string {
  return markup(
    {
      kicker: "CLADFACTS",
      headline: "Grade the news. Share the record.",
      subhead: "TV broadcasts, fact-checked and graded.",
      statLine: "Sourced claims. Letter grades. No hype.",
      ctaLabel: "Read at CladFacts",
      ctaUrl: "/",
    },
    photo
  );
}

function tourForCta(path: string): string {
  if (path.includes("bracket") || path.includes("map") || path.includes("election")) {
    return "/tour/1-feed.png";
  }
  if (path.includes("bias")) return "/tour/3-bias.png";
  if (path.includes("quiz") || path.includes("students")) return "/tour/1-feed.png";
  return "/tour/2-report.png";
}

function pngResponse(body: ReadableStream | ArrayBuffer | null, cacheSeconds = 3600): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": 'inline; filename="clad-campaign.png"',
      "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 6}`,
    },
  });
}

/** In-process PNG for Phase-3 Bluesky — never env.ASSETS.fetch of this route. */
export async function renderCampaignCard(
  campaign: Campaign,
  origin: string
): Promise<ArrayBuffer> {
  const fonts = await loadFonts(origin);
  const photo = await loadAssetDataUri(
    env.ASSETS,
    tourForCta(campaign.card.ctaUrl || "/"),
    origin
  );
  const img = new ImageResponse(markup(campaign.card, photo), {
    width: 1200,
    height: 630,
    fonts: fonts as any,
    format: "png",
  });
  return await new Response(img.body).arrayBuffer();
}

export const GET: APIRoute = async ({ request, params, locals }) => {
  const id = String(params.slug ?? "").trim();
  if (!id) return new Response("Not found", { status: 404 });

  const campaign = await getCampaign(env.AGENTS, id);
  if (!campaign) return new Response("Not found", { status: 404 });

  const cache = (caches as any).default as Cache | undefined;
  const url = new URL(request.url);
  // Fold updatedAt into version so Worker cache invalidates on each save.
  // Query string is dropped by ogCacheKey (anti-DoS); browser uses ?v=updatedAt.
  const cacheKey = ogCacheKey(
    url,
    "campaign-" + id,
    OG_VERSIONS.campaign + "-" + campaign.updatedAt
  );

  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch {
      /* ignore */
    }
  }

  try {
    const fonts = await loadFonts(url.origin);
    const photo = await loadAssetDataUri(
      env.ASSETS,
      tourForCta(campaign.card.ctaUrl || "/"),
      url.origin
    );
    const img = new ImageResponse(markup(campaign.card, photo), {
      width: 1200,
      height: 630,
      fonts: fonts as any,
      format: "png",
    });
    const resp = pngResponse(img.body);
    const cf = (locals as any)?.cfContext;
    if (cf?.waitUntil && cache) cf.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  } catch (err) {
    console.error("[og/campaign]", err);
    try {
      const fonts = await loadFonts(url.origin);
      const photo = await loadAssetDataUri(env.ASSETS, "/tour/2-report.png", url.origin);
      const img = new ImageResponse(fallbackMarkup(photo), {
        width: 1200,
        height: 630,
        fonts: fonts as any,
        format: "png",
      });
      return pngResponse(img.body, 300);
    } catch (err2) {
      console.error("[og/campaign] fallback", err2);
      return new Response("Card image unavailable", {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
  }
};
