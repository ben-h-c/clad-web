import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { findPolitician } from "~/lib/politicians";
import { OG_VERSIONS, ogCacheKey, OG, ogGradeColors, ogLeanBarMarkup } from "~/lib/ogCard";
import { getPoliticianPhotoMap } from "~/lib/agents";
import {
  photoForSlug,
  wikiTitleForSlug,
  isCommonsMediaUrl,
  monogram,
} from "~/lib/politicianPhotos";

export const prerender = false;

// Share card for /politicians/[slug]/. Name, race, portrait, person claim-record
// grade + ideology lean (same person* fields as the HTML scoreband — not media
// coverage averages).

const PAPER = OG.paper;
const INK = OG.ink;
const MUTED = OG.muted;
const RED = OG.accent;
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
    if (buf.byteLength < 400 || buf.byteLength > 2_500_000) return null;
    const bytes = new Uint8Array(buf);
    let mime = (r.headers.get("content-type") || "").split(";")[0]?.trim() || "";
    if (!mime.startsWith("image/")) {
      if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = "image/png";
      else if (bytes[0] === 0xff && bytes[1] === 0xd8) mime = "image/jpeg";
      else if (bytes[0] === 0x52 && bytes[1] === 0x49) mime = "image/webp";
      else return null;
    }
    if (mime === "image/svg+xml" || mime === "image/gif") return null;
    return arrayBufferToDataUri(buf, mime);
  } catch {
    return null;
  }
}

function leanLabel(score: number): string {
  if (Math.abs(score) < 5) return "Centered";
  return `${Math.abs(score)}% ${score > 0 ? "Right" : "Left"}-leaning`;
}

interface CardInput {
  name: string;
  race: string | null;
  count: number;
  photoDataUri: string | null;
  initials: string;
  /** Person claim-record letter grade (not media coverage avg). */
  grade: string | null;
  /** Person ideology lean −100…+100 (not media coverage avg). */
  lean: number | null;
}

function markup(card: CardInput): string {
  const reports =
    card.count === 0
      ? "On the CladFacts roster"
      : `${card.count} graded report${card.count === 1 ? " mentions" : "s mention"} them`;
  const raceLine = card.race ? card.race.toUpperCase() : "FACT-CHECK REPORT CARD";

  const photoBlock = card.photoDataUri
    ? `<div style="display:flex;width:240px;height:240px;border:1px solid ${OG.rule};border-radius:20px;overflow:hidden;flex-shrink:0;background:${INK}">
        <img src="${card.photoDataUri}" width="240" height="240" style="object-fit:cover;object-position:center top;width:240px;height:240px;" />
      </div>`
    : `<div style="display:flex;width:240px;height:240px;border:1px solid ${OG.rule};border-radius:20px;align-items:center;justify-content:center;flex-shrink:0;background:${OG.accentSoft}">
        <div style="display:flex;font-size:72px;font-weight:700;color:${MUTED};letter-spacing:2px">${esc(card.initials)}</div>
      </div>`;

  const g = card.grade ? ogGradeColors(card.grade) : null;
  const badgeSize = card.grade && card.grade.length <= 2 ? 64 : 36;
  const gradeStamp = g
    ? `<div style="display:flex;flex-direction:column;align-items:center;border-radius:999px;padding:12px 18px;background:${g.bg};flex-shrink:0;min-width:84px;min-height:84px;justify-content:center;">
        <div style="display:flex;font-size:${badgeSize}px;font-weight:700;line-height:1;color:${g.ink};">${esc(card.grade!)}</div>
        <div style="display:flex;font-size:12px;color:${g.ink};letter-spacing:1px;margin-top:4px;font-weight:700;">CLAIM RECORD</div>
      </div>`
    : "";

  const leanBlock =
    card.lean != null
      ? `<div style="display:flex;flex-direction:column;margin-left:${card.grade ? "20" : "0"}px;">
          <div style="display:flex;font-size:13px;letter-spacing:1px;color:${MUTED};font-weight:700;">IDEOLOGY</div>
          <div style="display:flex;font-size:24px;font-weight:700;margin-top:2px;color:${INK};">${esc(leanLabel(card.lean))}</div>
          ${ogLeanBarMarkup(card.lean, 300)}
        </div>`
      : "";

  const scoresRow =
    gradeStamp || leanBlock
      ? `<div style="display:flex;flex-direction:row;align-items:center;margin-top:16px;">
          ${gradeStamp}${leanBlock}
        </div>`
      : `<div style="display:flex;font-size:20px;color:${MUTED};margin-top:16px;line-height:1.35">Person scores pending — see graded appearances</div>`;

  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:36px 44px;">
    <div style="display:flex;flex-direction:column;flex:1;background:${OG.card};border-radius:24px;border:1px solid ${OG.rule};padding:28px 36px;">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:26px;font-weight:700;letter-spacing:-0.5px;color:${INK}">CladFacts</div>
      <div style="display:flex;font-size:13px;letter-spacing:1px;color:${RED};font-weight:700;background:${OG.accentSoft};padding:6px 14px;border-radius:999px">POLITICIAN REPORT CARD</div>
    </div>
    <div style="display:flex;flex-direction:row;align-items:flex-start;width:100%;flex:1;margin-top:22px">
      ${photoBlock}
      <div style="display:flex;flex-direction:column;margin-left:32px;flex:1;min-width:0">
        <div style="display:flex;font-size:14px;letter-spacing:1px;color:${RED};font-weight:700">${esc(raceLine)}</div>
        <div style="display:flex;font-size:48px;font-weight:700;line-height:1.05;margin-top:8px;max-width:760px;color:${INK}">${esc(card.name)}</div>
        ${scoresRow}
        <div style="display:flex;font-size:22px;margin-top:16px;line-height:1.25;font-weight:600;color:${MUTED}">${esc(reports)}</div>
      </div>
    </div>
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%;padding-top:16px">
      <div style="display:flex;background:${OG.accent};border-radius:999px;color:#FFFFFF;padding:12px 22px;font-size:16px;letter-spacing:1px;font-weight:700">FULL REPORT CARD</div>
      <div style="display:flex;font-size:16px;color:${MUTED};font-weight:600">cladfacts.com/politicians</div>
    </div>
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
  // Pass AGENTS so person grade/lean resolve from live profiles + seed baselines.
  const pol = await findPolitician(all, slug, env.AGENTS);
  if (!pol) return new Response(null, { status: 404 });

  const origin = new URL(request.url).origin;
  const [fonts, photoUrl] = await Promise.all([loadFonts(origin), resolvePortraitUrl(slug)]);
  const photoDataUri = await loadPortraitDataUri(photoUrl);

  const img = new ImageResponse(
    markup({
      name: pol.name,
      race: pol.race ?? null,
      count: pol.appearances.length,
      photoDataUri,
      initials: monogram(pol.name),
      grade: pol.personGrade,
      lean: pol.personLean,
    }),
    {
      width: 1200,
      height: 630,
      fonts: fonts as any,
      format: "png",
    }
  );
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
