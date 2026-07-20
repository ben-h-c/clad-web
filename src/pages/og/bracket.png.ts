import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { buildRaceBoard } from "~/lib/bracket";
import { DEFAULT_ELECTION_ID } from "~/lib/elections";
import {
  loadImageDataUri,
  ogCacheKey,
  OG_VERSIONS,
  portraitStripMarkup,
  OG,
} from "~/lib/ogCard";
import { getCommunityVotes } from "~/lib/picks";
import { photoForSlug, isCommonsMediaUrl } from "~/lib/politicianPhotos";
import { RACE_MATCHUPS } from "~/lib/races";

export const prerender = false;

// Public race-board share card — offices + heat only (no gated leaders).
// v3: Commons portraits of hot-race candidates for social thumbnails.

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
        // workers-og can still render with the runtime default face
        return [];
      }
    })();
  }
  return fontsPromise;
}

const esc = (s: unknown) => String(s ?? "").replace(/[<>&]/g, "");

/** Prefer hottest races; fall back to marquee editorial list so the card is never empty. */
function raceLines(board: ReturnType<typeof buildRaceBoard>): string[] {
  const hot = board.cards
    .filter((c) => c.heat > 0)
    .slice(0, 6)
    .map((c) => c.def.office);
  if (hot.length >= 3) return hot;
  const marquee = RACE_MATCHUPS.filter((r) => r.tier === "marquee").map((r) => r.office);
  const rest = RACE_MATCHUPS.filter((r) => r.tier !== "marquee").map((r) => r.office);
  const merged = [...new Set([...hot, ...marquee, ...rest])];
  return merged.slice(0, 6);
}

function markup(lines: string[], n: number, lockedBallots = 0, portraits: string[] = []): string {
  const body =
    lines.length > 0
      ? lines.map((l) => esc(l)).join("  ·  ")
      : "Class II Senate · midterm governors · your picks, not polls";
  const subhead =
    lockedBallots > 25
      ? `${n} races · ${lockedBallots.toLocaleString("en-US")} ballots locked · share your sheet`
      : `${n} races · Senate + governors · share your sheet`;
  const faces = portraits.length
    ? `<div style="display:flex;margin-top:20px">${portraitStripMarkup(portraits, { size: 108, gap: 12 })}</div>`
    : "";
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair,Georgia,serif;padding:44px 56px;border:1px solid ${OG.rule};border-radius:24px">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:30px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:18px;letter-spacing:3px;color:${MUTED};font-weight:700">MIDTERMS 2026</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:16px 0 20px"></div>
    <div style="display:flex;font-size:20px;letter-spacing:4px;color:${RED};font-weight:700">WHO WINS THE SENATE?</div>
    <div style="display:flex;font-size:50px;font-weight:700;line-height:1.05;margin-top:8px">Make your picks. Lock them in.</div>
    <div style="display:flex;font-size:26px;margin-top:14px;line-height:1.3;font-weight:700">${esc(subhead)}</div>
    ${faces}
    <div style="display:flex;font-size:22px;color:${MUTED};margin-top:14px;line-height:1.4;max-width:1020px">${body}</div>
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%">
      <div style="display:flex;border:3px solid ${RED};color:${RED};padding:12px 24px;font-size:20px;letter-spacing:2px;font-weight:700">FILL YOUR BALLOT</div>
      <div style="display:flex;font-size:20px;color:${MUTED};letter-spacing:2px">cladfacts.com/bracket</div>
    </div>
  </div>`;
}

function fallbackMarkup(): string {
  return markup(
    RACE_MATCHUPS.filter((r) => r.tier === "marquee")
      .slice(0, 5)
      .map((r) => r.office),
    RACE_MATCHUPS.length,
    0,
    []
  );
}

async function loadRacePortraits(
  board: ReturnType<typeof buildRaceBoard>,
  origin: string
): Promise<string[]> {
  const slugs: string[] = [];
  const ordered = [...board.cards].sort((a, b) => b.heat - a.heat);
  for (const c of ordered) {
    for (const side of [c.a, c.b]) {
      const slug = side.slug;
      if (!slug || slug.includes("field") || slugs.includes(slug)) continue;
      if (!photoForSlug(slug)) continue;
      slugs.push(slug);
      if (slugs.length >= 5) break;
    }
    if (slugs.length >= 5) break;
  }
  // Marquee fallbacks when heat is sparse
  if (slugs.length < 3) {
    for (const r of RACE_MATCHUPS.filter((x) => x.tier === "marquee")) {
      for (const side of [r.a, r.b]) {
        if (!side.slug || side.slug.includes("field") || slugs.includes(side.slug)) continue;
        if (!photoForSlug(side.slug)) continue;
        slugs.push(side.slug);
        if (slugs.length >= 5) break;
      }
      if (slugs.length >= 5) break;
    }
  }
  const uris: string[] = [];
  for (const slug of slugs) {
    const url = photoForSlug(slug);
    if (!url || !isCommonsMediaUrl(url)) continue;
    const uri = await loadImageDataUri(url, origin, { kind: "commons" });
    if (uri) uris.push(uri);
    if (uris.length >= 5) break;
  }
  return uris;
}

function pngResponse(body: ReadableStream | ArrayBuffer | null, cacheSeconds = 3600): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": 'inline; filename="clad-midterms-2026.png"',
      "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 6}`,
    },
  });
}

export const GET: APIRoute = async ({ request, locals }) => {
  const cache = (caches as any).default as Cache | undefined;
  const url = new URL(request.url);
  // Version folded into a synthetic path (query string dropped — anti-DoS);
  // bumping OG_VERSIONS.bracket invalidates the Worker cache on deploy.
  const cacheKey = ogCacheKey(url, "bracket", OG_VERSIONS.bracket);

  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch {
      /* ignore cache read errors */
    }
  }

  try {
    const all = await getCollection("posts", (p) => !p.data.draft);
    const board = buildRaceBoard(all, false);
    const lines = raceLines(board);
    // Anonymous aggregate only — social proof subhead once >25 ballots locked.
    const summary = await getCommunityVotes(DEFAULT_ELECTION_ID).catch(() => null);
    const lockedBallots = summary?.lockedBallots ?? 0;
    const portraits = await loadRacePortraits(board, url.origin);
    const fonts = await loadFonts(url.origin);
    const img = new ImageResponse(markup(lines, board.cards.length, lockedBallots, portraits), {
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
    console.error("[og/bracket.png]", err);
    try {
      const fonts = await loadFonts(url.origin);
      const img = new ImageResponse(fallbackMarkup(), {
        width: 1200,
        height: 630,
        fonts: fonts as any,
        format: "png",
      });
      return pngResponse(img.body, 300);
    } catch (err2) {
      console.error("[og/bracket.png] fallback", err2);
      return new Response("Card image unavailable", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  }
};
