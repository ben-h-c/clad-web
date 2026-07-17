import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { buildRaceBoard } from "~/lib/bracket";
import { DEFAULT_ELECTION_ID } from "~/lib/elections";
import { ogCacheKey, OG_VERSIONS } from "~/lib/ogCard";
import { getCommunityVotes } from "~/lib/picks";
import { RACE_MATCHUPS } from "~/lib/races";

export const prerender = false;

// Public race-board share card — offices + heat only (no gated leaders).

const PAPER = "#F5EDD9";
const INK = "#1A140D";
const MUTED = "#6E5E4D";
const RED = "#941A1A";

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

function markup(lines: string[], n: number, lockedBallots = 0): string {
  const body =
    lines.length > 0
      ? lines.map((l) => esc(l)).join("  ·  ")
      : "Class II Senate · midterm governors · your picks, not polls";
  // Social proof once the community tally is meaningful; format ad otherwise.
  const subhead =
    lockedBallots > 25
      ? `${n} races · ${lockedBallots.toLocaleString("en-US")} ballots locked · share your sheet`
      : `${n} races · Senate + governors · share your sheet`;
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair,Georgia,serif;padding:48px 64px;border:16px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:32px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${MUTED};font-weight:700">MIDTERMS 2026</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:20px 0 24px"></div>
    <div style="display:flex;font-size:22px;letter-spacing:4px;color:${RED};font-weight:700">WHO WINS THE SENATE?</div>
    <div style="display:flex;font-size:56px;font-weight:700;line-height:1.05;margin-top:10px">Make your picks. Lock them in.</div>
    <div style="display:flex;font-size:30px;margin-top:18px;line-height:1.3;font-weight:700">${esc(subhead)}</div>
    <div style="display:flex;font-size:24px;color:${MUTED};margin-top:16px;line-height:1.4;max-width:1020px">${body}</div>
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%">
      <div style="display:flex;border:3px solid ${RED};color:${RED};padding:12px 24px;font-size:22px;letter-spacing:2px;font-weight:700">FILL YOUR BALLOT</div>
      <div style="display:flex;font-size:22px;color:${MUTED};letter-spacing:2px">cladfacts.com/bracket</div>
    </div>
  </div>`;
}

function fallbackMarkup(): string {
  return markup(
    RACE_MATCHUPS.filter((r) => r.tier === "marquee")
      .slice(0, 5)
      .map((r) => r.office),
    RACE_MATCHUPS.length
  );
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
    const fonts = await loadFonts(url.origin);
    const img = new ImageResponse(markup(lines, board.cards.length, lockedBallots), {
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
