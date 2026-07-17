import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ImageResponse } from "workers-og";
import { DEFAULT_ELECTION_ID } from "~/lib/elections";
import { ogCacheKey, OG_VERSIONS } from "~/lib/ogCard";
import { getCommunityVotes, type CommunityRaceTally } from "~/lib/picks";
import { RACE_MATCHUPS } from "~/lib/races";

export const prerender = false;

// Community consensus share card — anonymous aggregates only (locked-ballot
// counts + race percentages, non-gated by design). Never names a voter.

const PAPER = "#F5EDD9";
const INK = "#1A140D";
const MUTED = "#6E5E4D";
const RED = "#941A1A";
const SOLID_D = "#0b3d91"; // .home-emap__party--solid-d
const SOLID_R = "#8b1a14"; // .home-emap__party--solid-r

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

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Count partisan leads by the LEADING SIDE'S PARTY, never by side letter —
 * side "a" is not always the Democrat (Maine: a = Collins, R). Races led by
 * null/I/O-party sides are skipped; ties are counted separately.
 */
function partisanLeads(races: CommunityRaceTally[]): {
  dLeads: number;
  rLeads: number;
  ties: number;
} {
  let dLeads = 0;
  let rLeads = 0;
  let ties = 0;
  for (const r of races) {
    if (r.leader === "tie") {
      ties += 1;
      continue;
    }
    if (r.leader !== "a" && r.leader !== "b") continue;
    const party = r.leader === "a" ? r.aParty : r.bParty;
    if (party === "D") dLeads += 1;
    else if (party === "R") rLeads += 1;
  }
  return { dLeads, rLeads, ties };
}

function markup(opts: {
  lockedBallots: number;
  dLeads: number;
  rLeads: number;
  ties: number;
  closest: CommunityRaceTally;
}): string {
  const { lockedBallots, dLeads, rLeads, ties, closest } = opts;
  const subline = `${dLeads} races lean D · ${rLeads} lean R${ties ? ` · ${ties} tied` : ""}`;
  const aWeight = closest.leader === "a" ? 700 : 400;
  const bWeight = closest.leader === "b" ? 700 : 400;
  // Clamp so a 90/10 blowout still shows both segments (purely graphical —
  // no text inside the bar; extreme splits clip text in satori).
  const aWidth = clamp(closest.aPct, 6, 94);
  // Segment colors keyed by each SIDE'S PARTY, never by side letter — side
  // "a" is not always the Democrat (Maine: a = Collins, R). A party-miscolored
  // bar on a fact-checking site is a screenshot waiting to happen.
  const partyFill = (party: string | null) =>
    party === "D" ? SOLID_D : party === "R" ? SOLID_R : MUTED;
  const aFill = partyFill(closest.aParty);
  const bFill = partyFill(closest.bParty);
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair,Georgia,serif;padding:48px 64px;border:16px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:32px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${MUTED};font-weight:700">MIDTERMS 2026</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:20px 0 24px"></div>
    <div style="display:flex;font-size:22px;letter-spacing:4px;color:${RED};font-weight:700">THE COMMUNITY HAS VOTED</div>
    <div style="display:flex;font-size:64px;font-weight:700;line-height:1.05;margin-top:10px">${esc(lockedBallots.toLocaleString("en-US"))} ballots locked</div>
    <div style="display:flex;font-size:28px;margin-top:14px;line-height:1.3">${esc(subline)}</div>
    <div style="display:flex;flex-direction:column;margin-top:28px;width:100%">
      <div style="display:flex;font-size:22px;letter-spacing:3px;color:${MUTED};font-weight:700">CLOSEST RACE · ${esc(closest.office.toUpperCase())}</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;width:1020px;margin-top:14px">
        <div style="display:flex;font-size:30px;line-height:1;font-weight:${aWeight}">${esc(closest.aName)} ${closest.aPct}%</div>
        <div style="display:flex;font-size:30px;line-height:1;font-weight:${bWeight}">${esc(closest.bName)} ${closest.bPct}%</div>
      </div>
      <div style="display:flex;width:1020px;height:44px;border:3px solid ${INK};margin-top:10px">
        <div style="display:flex;width:${aWidth}%;background:${aFill}"></div>
        <div style="display:flex;flex:1;background:${bFill}"></div>
      </div>
    </div>
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%">
      <div style="display:flex;border:3px solid ${RED};color:${RED};padding:12px 24px;font-size:22px;letter-spacing:2px;font-weight:700">FILL YOUR BALLOT</div>
      <div style="display:flex;font-size:22px;color:${MUTED};letter-spacing:2px">cladfacts.com/bracket/votes</div>
    </div>
  </div>`;
}

/**
 * Generic bracket.png-style "Make your picks" card — shipped when the tally
 * is too small to be proud of (null summary, <10 locked ballots, or no race
 * with at least 2 votes).
 */
function genericMarkup(): string {
  const lines = RACE_MATCHUPS.filter((r) => r.tier === "marquee")
    .slice(0, 5)
    .map((r) => r.office);
  const n = RACE_MATCHUPS.length;
  const body =
    lines.length > 0
      ? lines.map((l) => esc(l)).join("  ·  ")
      : "Class II Senate · midterm governors · your picks, not polls";
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair,Georgia,serif;padding:48px 64px;border:16px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:32px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${MUTED};font-weight:700">MIDTERMS 2026</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:20px 0 24px"></div>
    <div style="display:flex;font-size:22px;letter-spacing:4px;color:${RED};font-weight:700">WHO WINS THE SENATE?</div>
    <div style="display:flex;font-size:56px;font-weight:700;line-height:1.05;margin-top:10px">Make your picks. Lock them in.</div>
    <div style="display:flex;font-size:30px;margin-top:18px;line-height:1.3;font-weight:700">${n} races · Senate + governors · share your sheet</div>
    <div style="display:flex;font-size:24px;color:${MUTED};margin-top:16px;line-height:1.4;max-width:1020px">${body}</div>
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%">
      <div style="display:flex;border:3px solid ${RED};color:${RED};padding:12px 24px;font-size:22px;letter-spacing:2px;font-weight:700">FILL YOUR BALLOT</div>
      <div style="display:flex;font-size:22px;color:${MUTED};letter-spacing:2px">cladfacts.com/bracket</div>
    </div>
  </div>`;
}

function pngResponse(body: ReadableStream | ArrayBuffer | null, cacheSeconds = 300): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": 'inline; filename="clad-community-votes-2026.png"',
      "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 6}`,
    },
  });
}

export const GET: APIRoute = async ({ request, locals }) => {
  const cache = (caches as any).default as Cache | undefined;
  const url = new URL(request.url);
  // Version folded into a synthetic path (query string dropped — anti-DoS);
  // bumping OG_VERSIONS.bracketVotes invalidates the Worker cache on deploy.
  const cacheKey = ogCacheKey(url, "bracket-votes", OG_VERSIONS.bracketVotes);

  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch {
      /* ignore cache read errors */
    }
  }

  try {
    const summary = await getCommunityVotes(DEFAULT_ELECTION_ID);
    const lockedBallots = summary?.lockedBallots ?? 0;
    const contested = (summary?.races ?? []).filter((r) => r.total >= 2);
    contested.sort(
      (a, b) => Math.abs(a.aPct - 50) - Math.abs(b.aPct - 50) || b.total - a.total
    );
    const closest = contested[0] ?? null;

    // Small ballot counts fail the proud-to-post test — ship the CTA card.
    const html =
      !summary || lockedBallots < 10 || !closest
        ? genericMarkup()
        : markup({ lockedBallots, ...partisanLeads(summary.races), closest });

    const fonts = await loadFonts(url.origin);
    const img = new ImageResponse(html, {
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
    console.error("[og/bracket-votes.png]", err);
    try {
      const fonts = await loadFonts(url.origin);
      const img = new ImageResponse(genericMarkup(), {
        width: 1200,
        height: 630,
        fonts: fonts as any,
        format: "png",
      });
      return pngResponse(img.body, 120);
    } catch (err2) {
      console.error("[og/bracket-votes.png] fallback", err2);
      return new Response("Card image unavailable", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  }
};
