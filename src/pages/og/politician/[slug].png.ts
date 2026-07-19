import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { findPolitician } from "~/lib/politicians";
import { OG_VERSIONS, ogCacheKey } from "~/lib/ogCard";
import { getPoliticianPhotoMap } from "~/lib/agents";
import {
  photoForSlug,
  wikiTitleForSlug,
  isCommonsMediaUrl,
  monogram,
} from "~/lib/politicianPhotos";

export const prerender = false;

// Share card for /politicians/[slug]/. Public only: name, race, report count,
// and Commons portrait. Never put avg grade / lean / factuality here — those
// stay behind the free account wall on the HTML page (same rule as the week OG).

const PAPER = "#F5EDD9";
const INK = "#1A140D";
const MUTED = "#6E5E4D";
const RED = "#941A1A";
const UA = "CladFactsOG/1.0 (+https://cladfacts.com; politician report cards)";

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

function arrayBufferToDataUri(buf: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/** Resolve a Commons-hosted portrait URL for the OG card. */
async function resolvePortraitUrl(slug: string): Promise<string | null> {
  const known = photoForSlug(slug);
  if (known && isCommonsMediaUrl(known)) return known;

  try {
    const live = await getPoliticianPhotoMap(env.AGENTS);
    const fromKv = live?.bySlug?.[slug];
    if (fromKv && isCommonsMediaUrl(fromKv)) return fromKv;
  } catch {
    /* ignore */
  }

  // One Wikipedia hop for mapped titles (static map / KV miss).
  const title = wikiTitleForSlug(slug);
  if (title) {
    try {
      const r = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) }
      );
      if (r.ok) {
        const j = (await r.json()) as { thumbnail?: { source?: string }; type?: string };
        if (j.type !== "disambiguation") {
          const src = j.thumbnail?.source ?? null;
          if (src && isCommonsMediaUrl(src)) return src;
        }
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

async function loadPortraitDataUri(url: string | null): Promise<string | null> {
  if (!url || !isCommonsMediaUrl(url)) return null;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    // Skip tiny broken responses and oversized files (satori memory).
    if (buf.byteLength < 400 || buf.byteLength > 2_500_000) return null;
    const bytes = new Uint8Array(buf);
    let mime = (r.headers.get("content-type") || "").split(";")[0]?.trim() || "";
    if (!mime.startsWith("image/")) {
      if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = "image/png";
      else if (bytes[0] === 0xff && bytes[1] === 0xd8) mime = "image/jpeg";
      else if (bytes[0] === 0x52 && bytes[1] === 0x49) mime = "image/webp";
      else return null;
    }
    // Satori/workers-og is happiest with JPEG/PNG; skip SVG/etc.
    if (mime === "image/svg+xml" || mime === "image/gif") return null;
    return arrayBufferToDataUri(buf, mime);
  } catch {
    return null;
  }
}

function markup(
  name: string,
  race: string | null,
  count: number,
  photoDataUri: string | null,
  initials: string
): string {
  const reports = `${count} graded report${count === 1 ? " mentions" : "s mention"} them`;
  const raceLine = race ? race.toUpperCase() : "FACT-CHECK REPORT CARD";

  // Square portrait on the left — matches the site avatar aesthetic (ink border,
  // cover crop from top). Monogram box when no Commons photo is available.
  const photoBlock = photoDataUri
    ? `<div style="display:flex;width:280px;height:280px;border:4px solid ${INK};overflow:hidden;flex-shrink:0;background:${INK}">
        <img src="${photoDataUri}" width="280" height="280" style="object-fit:cover;object-position:center top;width:280px;height:280px;" />
      </div>`
    : `<div style="display:flex;width:280px;height:280px;border:4px solid ${INK};align-items:center;justify-content:center;flex-shrink:0;background:rgba(26,20,13,0.1)">
        <div style="display:flex;font-size:88px;font-weight:700;color:${MUTED};letter-spacing:4px">${esc(initials)}</div>
      </div>`;

  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:44px 56px;border:16px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:30px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:18px;letter-spacing:3px;color:${MUTED};font-weight:700">POLITICIAN REPORT CARD</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:16px 0 28px"></div>
    <div style="display:flex;flex-direction:row;align-items:flex-start;width:100%;flex:1">
      ${photoBlock}
      <div style="display:flex;flex-direction:column;margin-left:40px;flex:1;min-width:0">
        <div style="display:flex;font-size:20px;letter-spacing:4px;color:${RED};font-weight:700">${esc(raceLine)}</div>
        <div style="display:flex;font-size:56px;font-weight:700;line-height:1.05;margin-top:10px;max-width:720px">${esc(name)}</div>
        <div style="display:flex;font-size:30px;margin-top:20px;line-height:1.25;font-weight:700">${esc(reports)}</div>
        <div style="display:flex;font-size:24px;color:${MUTED};margin-top:10px;line-height:1.35">How the coverage held up — free with any account</div>
      </div>
    </div>
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%;padding-top:20px">
      <div style="display:flex;border:3px solid ${RED};color:${RED};padding:12px 24px;font-size:20px;letter-spacing:2px;font-weight:700">SEE EVERY GRADE</div>
      <div style="display:flex;font-size:20px;color:${MUTED};letter-spacing:2px">cladfacts.com/politicians</div>
    </div>
  </div>`;
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const slug = String(params.slug ?? "").trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return new Response(null, { status: 404 });

  const cache = (caches as any).default as Cache;
  // ogCacheKey drops the query string (?anything must not fan out satori
  // renders) and folds the version into a synthetic path segment.
  const cacheKey = ogCacheKey(new URL(request.url), "politician", OG_VERSIONS.politician);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const all = await getCollection("posts", (p) => !p.data.draft);
  const pol = await findPolitician(all, slug);
  if (!pol) return new Response(null, { status: 404 });

  const origin = new URL(request.url).origin;
  const [fonts, photoUrl] = await Promise.all([loadFonts(origin), resolvePortraitUrl(slug)]);
  const photoDataUri = await loadPortraitDataUri(photoUrl);
  const initials = monogram(pol.name);

  const img = new ImageResponse(markup(pol.name, pol.race ?? null, pol.appearances.length, photoDataUri, initials), {
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
