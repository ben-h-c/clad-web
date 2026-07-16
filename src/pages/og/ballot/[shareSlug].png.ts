import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ImageResponse } from "workers-og";
import { getPublicSharedBallot } from "~/lib/picks";
import { getElection } from "~/lib/elections";

export const prerender = false;

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
        return [];
      }
    })();
  }
  return fontsPromise;
}

const esc = (s: unknown) => String(s ?? "").replace(/[<>&]/g, "");

function markup(opts: {
  name: string;
  lines: string[];
  scoreLine: string;
  slug: string;
}): string {
  const body =
    opts.lines.length > 0
      ? opts.lines.map((l) => esc(l)).join("   ·   ")
      : "Class II Senate · midterm governors · personal picks";
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair,Georgia,serif;padding:48px 64px;border:16px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:32px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${MUTED};font-weight:700">MIDTERMS 2026</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:20px 0 24px"></div>
    <div style="display:flex;font-size:22px;letter-spacing:4px;color:${RED};font-weight:700">LOCKED BALLOT · CAN YOU BEAT THEM?</div>
    <div style="display:flex;font-size:50px;font-weight:700;line-height:1.05;margin-top:10px">${esc(opts.name)}'s 2026 picks</div>
    <div style="display:flex;font-size:28px;margin-top:16px;line-height:1.3;font-weight:700">${esc(opts.scoreLine)}</div>
    <div style="display:flex;font-size:22px;color:${MUTED};margin-top:14px;line-height:1.4;max-width:1020px">${body}</div>
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%">
      <div style="display:flex;border:3px solid ${RED};color:${RED};padding:12px 24px;font-size:20px;letter-spacing:2px;font-weight:700">FILL YOUR BALLOT →</div>
      <div style="display:flex;font-size:20px;color:${MUTED};letter-spacing:1px">cladfacts.com/bracket</div>
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
  const lines: string[] = [];
  for (const race of election.races) {
    if (lines.length >= 7) break;
    const side = pickMap.get(race.id);
    if (!side) continue;
    const winner = side === "a" ? race.a.name : race.b.name;
    const shortOffice = race.office.replace(" U.S. Senate", " Sen.").replace(" Governor", " Gov.");
    lines.push(`${shortOffice}: ${winner}`);
  }

  const name = ballot.displayName || "A Clad reader";
  const s = ballot.score;
  const scoreLine =
    s.called > 0
      ? `${s.correct} correct · ${s.wrong} wrong · ${s.called} called`
      : `${s.picked} of ${s.total} races picked`;

  const origin = new URL(request.url).origin;
  try {
    const fonts = await loadFonts(origin);
    const img = new ImageResponse(
      markup({ name, lines, scoreLine, slug: shareSlug }),
      { width: 1200, height: 630, fonts: fonts as any, format: "png" }
    );
    return new Response(img.body, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    });
  } catch (err) {
    console.error("[og/ballot]", err);
    return new Response("Card image unavailable", {
      status: 503,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }
};
