import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { clip, loadImageDataUri, ogCacheKey, OG_VERSIONS, postStillUrl } from "~/lib/ogCard";
import { pickQuizQuestions } from "~/lib/quiz";

export const prerender = false;

// Share card for The Morning Quiz. Content-addressed by Eastern date so the
// card (and its edge-cache entry) rolls over with the quiz itself. It teases
// the quiz's ACTUAL first claim — selected by the same pickQuizQuestions the
// page uses, so card and page can never disagree. Claim text + verdict
// options are free report-body content; Clad's verdict for the claim is the
// quiz answer and must NEVER render here.
//
// v3: bake the first claim's report still so the unfurl has a photo.
const PAPER = "#F5EDD9";
const INK = "#1A140D";
const MUTED = "#6E5E4D";
const RED = "#941A1A";

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

function claimMarkup(opts: {
  dateLabel: string;
  edition: number;
  source: string;
  claim: string;
  thumbDataUri: string | null;
}): string {
  const chips = ["VERIFIED", "DISPUTED", "MISSING CONTEXT", "UNSUPPORTED"]
    .map(
      (c) =>
        `<div style="display:flex;border:3px solid ${INK};padding:10px 16px;font-size:18px;line-height:1;letter-spacing:2px;font-weight:700">${c}</div>`
    )
    .join("");
  const claimSize = opts.thumbDataUri ? 34 : 40;
  const claimMax = opts.thumbDataUri ? 95 : 110;

  const body = `<div style="display:flex;flex-direction:column;flex:1;min-width:0;${opts.thumbDataUri ? "padding-left:28px;" : ""}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:18px;letter-spacing:3px;color:${RED};font-weight:700">CLAIM 1 OF 5 · AIRED ON ${opts.source}</div>
      <div style="display:flex;font-size:18px;letter-spacing:2px;color:${MUTED};font-weight:700">${opts.dateLabel}</div>
    </div>
    <div style="display:flex;font-size:${claimSize}px;font-weight:700;line-height:1.25;margin-top:20px">“${opts.claim.slice(0, claimMax)}”</div>
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:auto">
      <div style="display:flex;font-size:18px;letter-spacing:3px;color:${MUTED};font-weight:700">CALL IT:</div>
      ${chips}
    </div>
  </div>`;

  const mid = opts.thumbDataUri
    ? `<div style="display:flex;flex-direction:row;flex:1;min-height:0;margin-top:8px">
        <div style="display:flex;width:380px;height:420px;overflow:hidden;border:3px solid ${INK};background:${INK};flex-shrink:0">
          <img src="${opts.thumbDataUri}" width="380" height="420" style="object-fit:cover;width:380px;height:420px;" />
        </div>
        ${body}
      </div>`
    : `<div style="display:flex;flex:1;min-height:0">${body}</div>`;

  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:40px 52px;border:16px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:26px;font-weight:700;letter-spacing:4px">CLADFACTS · THE MORNING QUIZ</div>
      <div style="display:flex;font-size:26px;font-weight:700;letter-spacing:2px;color:${RED}">No. ${opts.edition}</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:14px 0 18px"></div>
    ${mid}
    <div style="display:flex;font-size:20px;color:${MUTED};margin-top:18px;letter-spacing:2px;font-weight:700">cladfacts.com/quiz · 4 more claims inside</div>
  </div>`;
}

function markup(dateLabel: string, thumbDataUri: string | null): string {
  const photo = thumbDataUri
    ? `<div style="display:flex;width:360px;height:360px;overflow:hidden;border:4px solid ${INK};background:${INK};flex-shrink:0;margin-right:36px">
        <img src="${thumbDataUri}" width="360" height="360" style="object-fit:cover;width:360px;height:360px;" />
      </div>`
    : "";
  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:48px 64px;border:16px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:32px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:20px;letter-spacing:3px;color:${MUTED};font-weight:700">${dateLabel.toUpperCase()}</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:18px 0 28px"></div>
    <div style="display:flex;flex-direction:row;align-items:center;width:100%;flex:1">
      ${photo}
      <div style="display:flex;flex-direction:column;flex:1;min-width:0">
        <div style="display:flex;font-size:22px;letter-spacing:5px;color:${RED};font-weight:700">MOST PEOPLE GET 2 WRONG</div>
        <div style="display:flex;font-size:56px;font-weight:700;line-height:1.05;margin-top:12px">The Morning Quiz</div>
        <div style="display:flex;font-size:28px;margin-top:18px;line-height:1.3;font-weight:700">5 claims from this week. Can you spot the spin?</div>
        <div style="display:flex;font-size:22px;color:${MUTED};margin-top:auto;letter-spacing:2px;font-weight:700">cladfacts.com/quiz · free · new daily</div>
      </div>
    </div>
  </div>`;
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const date = String(params.date ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return new Response(null, { status: 404 });
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  const origin = new URL(request.url).origin;
  const cache = (caches as any).default as Cache;
  const cacheKey = ogCacheKey(new URL(request.url), "quiz", OG_VERSIONS.quiz);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const posts = await getCollection("posts", (p) => !p.data.draft);
  const questions = pickQuizQuestions(posts, date);
  const first = questions.length >= 5 ? questions[0]! : null;
  const edition = Math.floor(
    (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - QUIZ_EPOCH_UTC) / 86_400_000
  );

  let thumbDataUri: string | null = null;
  if (first) {
    const post = posts.find((p) => p.id === first.slug);
    if (post) {
      thumbDataUri = await loadImageDataUri(postStillUrl(post), origin, { kind: "thumb" });
    }
  }
  if (!thumbDataUri) {
    // Fallback: any recent broadcast still so the card never ships photo-free
    const recent = [...posts]
      .filter((p) => p.data.type === "broadcast")
      .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf())
      .slice(0, 8);
    for (const p of recent) {
      thumbDataUri = await loadImageDataUri(postStillUrl(p), origin, { kind: "thumb" });
      if (thumbDataUri) break;
    }
  }

  const html = first
    ? claimMarkup({
        dateLabel: label.toUpperCase(),
        edition,
        source: esc(clip(first.source, 30).toUpperCase()),
        claim: esc(clip(first.claim, 110)),
        thumbDataUri,
      })
    : markup(label, thumbDataUri);

  const fonts = await loadFonts(origin);
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
