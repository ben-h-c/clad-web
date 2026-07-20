import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ImageResponse } from "workers-og";
import { getPublicSharedBallot, listResults } from "~/lib/picks";
import { getElection } from "~/lib/elections";
import {
  loadImageDataUri,
  ogCacheKey,
  OG_VERSIONS,
  portraitStripMarkup,
  OG,
} from "~/lib/ogCard";
import { isCommonsMediaUrl, photoForSlug } from "~/lib/politicianPhotos";

export const prerender = false;

/**
 * Shared-ballot card: the sharer's PICKS are the card. A two-column grid of
 * party-colored race chips (state + office, candidate name), the reader's
 * name and running record, and a compact challenge CTA. Picks and anonymous
 * scores are public-by-design on shared ballots — nothing gated renders here.
 */

const PAPER = OG.paper;
const INK = OG.ink;
const MUTED = OG.muted;
const RED = OG.accent;
const SOLID_D = "#0b3d91"; // .home-emap__party--solid-d (election-map token)
const SOLID_R = "#8b1a14"; // .home-emap__party--solid-r
const GREEN = "#2d6a4f"; // correct-outcome tone (ballot page)

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

type Chip = { label: string; name: string; accent: string; outcome: "correct" | "wrong" | null };

/** Fit long candidate strings into a chip: strip parentheticals, then fall
 *  back to the surname ("Dem primary (Stevens / El-Sayed)" → "Dem primary"). */
function chipName(raw: string): string {
  let n = raw.trim();
  if (n.length <= 20) return n;
  n = n.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (n.length <= 20) return n;
  const words = n.split(/\s+/);
  const last = words[words.length - 1]!;
  return last.length >= 4 ? last : words.slice(-2).join(" ");
}

function markup(opts: {
  name: string;
  chips: Chip[];
  moreCount: number;
  scoreLine: string;
  hasResults: boolean;
  portraits: string[];
}): string {
  const chipBoxes = opts.chips.map((c) => {
    const mark =
      c.outcome === "correct"
        ? `<div style="display:flex;width:18px;height:18px;background:${GREEN};align-self:center;margin-right:16px"></div>`
        : c.outcome === "wrong"
          ? `<div style="display:flex;width:18px;height:18px;background:${RED};align-self:center;margin-right:16px"></div>`
          : "";
    return `<div style="display:flex;width:508px;height:70px;border:2px solid rgba(26,20,13,0.3);background:rgba(26,20,13,0.04);overflow:hidden">
      <div style="display:flex;width:10px;background:${c.accent}"></div>
      <div style="display:flex;flex-direction:column;justify-content:center;padding:0 16px;flex:1">
        <div style="display:flex;font-size:16px;line-height:1;letter-spacing:3px;color:${MUTED};font-weight:700">${esc(c.label)}</div>
        <div style="display:flex;font-size:26px;line-height:1.1;font-weight:700;margin-top:4px">${esc(c.name)}</div>
      </div>
      ${mark}
    </div>`;
  });
  if (opts.moreCount > 0) {
    chipBoxes.push(`<div style="display:flex;width:508px;height:70px;background:${INK};color:${PAPER};align-items:center;justify-content:center">
      <div style="display:flex;font-size:24px;line-height:1;font-weight:700;letter-spacing:3px">+${opts.moreCount} MORE PICKS</div>
    </div>`);
  }
  const grid =
    chipBoxes.length > 0
      ? `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;width:100%">${chipBoxes.join("")}</div>`
      : `<div style="display:flex;font-size:24px;color:${MUTED};margin-top:24px">Class II Senate · midterm governors · personal picks</div>`;
  const faces = opts.portraits.length
    ? `<div style="display:flex;margin-top:10px">${portraitStripMarkup(opts.portraits, { size: 72, gap: 8 })}</div>`
    : "";
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair,Georgia,serif;padding:28px 52px 30px;border:1px solid ${OG.rule};border-radius:24px">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:24px;line-height:1;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:16px;line-height:1;letter-spacing:3px;color:${MUTED};font-weight:700">MIDTERMS 2026 · BALLOT BOARD</div>
    </div>
    <div style="display:flex;width:100%;height:3px;background:${INK};margin:12px 0 12px"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;width:100%">
      <div style="display:flex;font-size:40px;font-weight:700;line-height:1">${esc(opts.name)}’s picks</div>
      <div style="display:flex;font-size:24px;line-height:1;font-weight:700;color:${opts.hasResults ? RED : MUTED};letter-spacing:1px">${esc(opts.scoreLine)}</div>
    </div>
    ${faces}
    ${grid}
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;border:3px solid ${RED};color:${RED};padding:8px 18px;font-size:17px;line-height:1;letter-spacing:2px;font-weight:700">PICK AGAINST THIS BALLOT</div>
      <div style="display:flex;font-size:17px;line-height:1;color:${MUTED};letter-spacing:1px">cladfacts.com/bracket</div>
    </div>
  </div>`;
}

export const GET: APIRoute = async ({ params, request }) => {
  const shareSlug = String(params.shareSlug ?? "").trim();
  if (!shareSlug) return new Response("Not found", { status: 404 });

  const ballot = await getPublicSharedBallot(shareSlug);
  if (!ballot) return new Response("Not found", { status: 404 });
  const election = getElection(ballot.electionId);
  if (!election) return new Response("Not found", { status: 404 });

  const pickMap = new Map(ballot.picks.map((p) => [p.raceId, p.side]));
  const results = await listResults(ballot.electionId);
  const resultBy = new Map(results.map((r) => [r.raceId, r]));

  const pickedRaces = election.races.filter((r) => pickMap.has(r.id));
  // Marquee races first — the names a stranger recognizes sell the card.
  pickedRaces.sort((x, y) => Number(y.tier === "marquee") - Number(x.tier === "marquee"));

  const MAX_CHIPS = 8; // 2 cols x 4 rows
  const visible = pickedRaces.length > MAX_CHIPS ? pickedRaces.slice(0, MAX_CHIPS - 1) : pickedRaces;
  const moreCount = pickedRaces.length - visible.length;

  const chips: Chip[] = visible.map((race) => {
    const side = pickMap.get(race.id)!;
    const cand = side === "a" ? race.a : race.b;
    const res = resultBy.get(race.id);
    const outcome =
      res && res.winnerSide !== "other" ? (res.winnerSide === side ? "correct" : "wrong") : null;
    return {
      label: `${race.state} ${race.chamber === "senate" ? "SENATE" : "GOVERNOR"}`,
      name: cand.party ? `${chipName(cand.name)} · ${cand.party}` : chipName(cand.name),
      accent: cand.party === "D" ? SOLID_D : cand.party === "R" ? SOLID_R : MUTED,
      outcome,
    };
  });

  const name = (ballot.displayName || "A Clad reader").slice(0, 20);
  const s = ballot.score;
  const dCount = pickedRaces.filter((r) => (pickMap.get(r.id) === "a" ? r.a : r.b).party === "D").length;
  const rCount = pickedRaces.filter((r) => (pickMap.get(r.id) === "a" ? r.a : r.b).party === "R").length;
  const scoreLine =
    s.called > 0
      ? `${s.correct}–${s.wrong} record · ${s.called} called`
      : dCount + rCount > 0
        ? `${s.picked} of ${s.total} picked · ${dCount} D — ${rCount} R`
        : `${s.picked} of ${s.total} races picked`;

  const origin = new URL(request.url).origin;
  const cache = (caches as any).default as Cache | undefined;
  const cacheKey = ogCacheKey(new URL(request.url), "ballot-" + shareSlug, OG_VERSIONS.ballot);
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch {
      /* ignore */
    }
  }

  // Portraits of picked candidates (Commons only) for a photo strip.
  const portraits: string[] = [];
  for (const race of visible) {
    if (portraits.length >= 5) break;
    const side = pickMap.get(race.id)!;
    const cand = side === "a" ? race.a : race.b;
    if (!cand.slug || cand.slug.includes("field")) continue;
    const purl = photoForSlug(cand.slug);
    if (!purl || !isCommonsMediaUrl(purl)) continue;
    const uri = await loadImageDataUri(purl, origin, { kind: "commons" });
    if (uri) portraits.push(uri);
  }

  try {
    const fonts = await loadFonts(origin);
    const img = new ImageResponse(
      markup({
        name,
        chips,
        moreCount,
        scoreLine,
        hasResults: s.called > 0,
        portraits,
      }),
      { width: 1200, height: 630, fonts: fonts as any, format: "png" }
    );
    const resp = new Response(img.body, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    });
    // Note: ballot cards change when picks/results change; short TTL only.
    return resp;
  } catch (err) {
    console.error("[og/ballot]", err);
    return new Response("Card image unavailable", {
      status: 503,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }
};
