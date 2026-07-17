import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { clip, ogCacheKey, OG_VERSIONS } from "~/lib/ogCard";
import { pickQuizQuestions } from "~/lib/quiz";

export const prerender = false;

// Share card for The Morning Quiz. Content-addressed by Eastern date so the
// card (and its edge-cache entry) rolls over with the quiz itself. It teases
// the quiz's ACTUAL first claim — selected by the same pickQuizQuestions the
// page uses, so card and page can never disagree. Claim text + verdict
// options are free report-body content; Clad's verdict for the claim is the
// quiz answer and must NEVER render here.
const PAPER = "#F5EDD9";
const INK = "#1A140D";
const MUTED = "#6E5E4D";
const RED = "#941A1A";

// Wordle-style edition number: days since the quiz launched (2026-06-15),
// keyed to the card's own Eastern date so each day's share is a visibly new
// artifact.
const QUIZ_EPOCH_UTC = Date.UTC(2026, 5, 15);

const esc = (s: unknown) => String(s ?? "").replace(/[<>]/g, " ");

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

/** Today's real first claim, spoiler-free: the reader is asked to CALL IT —
 *  the report's ruling stays inside the quiz. */
function claimMarkup(opts: { dateLabel: string; edition: number; source: string; claim: string }): string {
  const chips = ["VERIFIED", "DISPUTED", "MISSING CONTEXT", "UNSUPPORTED"]
    .map(
      (c) =>
        `<div style="display:flex;border:3px solid ${INK};padding:10px 16px;font-size:20px;line-height:1;letter-spacing:2px;font-weight:700">${c}</div>`
    )
    .join("");
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:48px 64px;border:16px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:28px;font-weight:700;letter-spacing:4px">CLADFACTS · THE MORNING QUIZ</div>
      <div style="display:flex;font-size:28px;font-weight:700;letter-spacing:2px;color:${RED}">No. ${opts.edition}</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:18px 0 26px"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${RED};font-weight:700">CLAIM 1 OF 5 · AIRED ON ${opts.source}</div>
      <div style="display:flex;font-size:20px;letter-spacing:2px;color:${MUTED};font-weight:700">${opts.dateLabel}</div>
    </div>
    <div style="display:flex;font-size:40px;font-weight:700;line-height:1.25;margin-top:24px">“${opts.claim}”</div>
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:auto">
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${MUTED};font-weight:700">CALL IT:</div>
      ${chips}
    </div>
    <div style="display:flex;font-size:22px;color:${MUTED};margin-top:26px;letter-spacing:2px;font-weight:700">cladfacts.com/quiz · 4 more claims inside</div>
  </div>`;
}

/** Generic invitation card — fallback when the day has fewer than 5 questions
 *  (the page shows its own "come back tomorrow" state on those days). */
function markup(dateLabel: string): string {
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:48px 64px;border:16px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:32px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${MUTED};font-weight:700">${dateLabel.toUpperCase()}</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:18px 0 28px"></div>
    <div style="display:flex;flex-direction:column;align-items:center;width:100%">
      <div style="display:flex;font-size:24px;letter-spacing:5px;color:${RED};font-weight:700">MOST PEOPLE GET 2 WRONG</div>
      <div style="display:flex;font-size:64px;font-weight:700;text-align:center;line-height:1.05;margin-top:12px">The Morning Quiz</div>
      <div style="display:flex;font-size:34px;margin-top:22px;line-height:1.3;font-weight:700;text-align:center">5 claims from this week. Can you spot the spin?</div>
      <div style="display:flex;gap:16px;margin-top:32px">
        <div style="display:flex;border:3px solid ${INK};padding:10px 20px;font-size:22px;letter-spacing:2px;font-weight:700">VERIFIED</div>
        <div style="display:flex;border:3px solid ${RED};color:${RED};padding:10px 20px;font-size:22px;letter-spacing:2px;font-weight:700">DISPUTED</div>
        <div style="display:flex;border:3px solid ${MUTED};color:${MUTED};padding:10px 20px;font-size:22px;letter-spacing:2px;font-weight:700">SPIN</div>
      </div>
      <div style="display:flex;font-size:24px;color:${MUTED};margin-top:36px;letter-spacing:2px;font-weight:700">cladfacts.com/quiz · free · new daily</div>
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
  // ogCacheKey folds OG_VERSIONS.quiz into a synthetic path (redesigns
  // invalidate on deploy) and drops the query string, preserving this route's
  // anti-satori-DoS property: ?anything must not fan out renders.
  const cacheKey = ogCacheKey(new URL(request.url), "quiz", OG_VERSIONS.quiz);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const posts = await getCollection("posts", (p) => !p.data.draft);
  const questions = pickQuizQuestions(posts, date);
  const first = questions.length >= 5 ? questions[0]! : null;
  const edition = Math.floor((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - QUIZ_EPOCH_UTC) / 86_400_000);

  const html = first
    ? claimMarkup({
        dateLabel: label.toUpperCase(),
        edition,
        source: esc(clip(first.source, 30).toUpperCase()),
        claim: esc(clip(first.claim, 110)),
      })
    : markup(label);

  const fonts = await loadFonts(new URL(request.url).origin);
  const img = new ImageResponse(html, { width: 1200, height: 630, fonts: fonts as any, format: "png" });
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
