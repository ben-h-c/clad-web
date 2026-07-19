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

// Share card for /politicians/[slug]/. Name, race, portrait, person claim-record
// grade + ideology lean (same person* fields as the HTML scoreband — not media
// coverage averages).

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

function gradeColor(grade: string): string {
  const t = (grade || "").charAt(0).toUpperCase();
  if (t === "A" || t === "B") return INK;
  if (t === "C") return MUTED;
  return RED;
}

function leanLabel(score: number): string {
  if (Math.abs(score) < 5) return "Centered";
  return `${Math.abs(score)}% ${score > 0 ? "Right" : "Left"}-leaning`;
}

/**
 * Lean as geometry (same Ground News pattern as post OG cards): blue/red split
 * with an ink tick at the lean score. Satori-safe flex layout.
 */
function leanBarMarkup(score: number): string {
  const s = Math.max(-100, Math.min(100, score));
  const pct = (s + 100) / 2;
  return `<div style="display:flex;flex-direction:column;width:320px;margin-top:6px;">
    <div style="display:flex;flex-direction:row;width:320px;height:18px;">
      <div style="display:flex;flex-grow:0;flex-shrink:1;flex-basis:${pct}%;"></div>
      <div style="display:flex;width:5px;height:18px;background:${INK};"></div>
    </div>
    <div style="display:flex;flex-direction:row;width:320px;height:12px;border:2px solid ${INK};">
      <div style="display:flex;flex:1;background:#0b3d91;"></div>
      <div style="display:flex;width:3px;background:${PAPER};"></div>
      <div style="display:flex;flex:1;background:#8b1a14;"></div>
    </div>
  </div>`;
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
    ? `<div style="display:flex;width:240px;height:240px;border:4px solid ${INK};overflow:hidden;flex-shrink:0;background:${INK}">
        <img src="${card.photoDataUri}" width="240" height="240" style="object-fit:cover;object-position:center top;width:240px;height:240px;" />
      </div>`
    : `<div style="display:flex;width:240px;height:240px;border:4px solid ${INK};align-items:center;justify-content:center;flex-shrink:0;background:rgba(26,20,13,0.1)">
        <div style="display:flex;font-size:72px;font-weight:700;color:${MUTED};letter-spacing:4px">${esc(card.initials)}</div>
      </div>`;

  const color = card.grade ? gradeColor(card.grade) : INK;
  const badgeSize = card.grade && card.grade.length <= 2 ? 72 : 40;
  const gradeStamp = card.grade
    ? `<div style="display:flex;flex-direction:column;align-items:center;border:5px solid ${color};padding:8px 16px;background:${PAPER};flex-shrink:0;">
        <div style="display:flex;font-size:${badgeSize}px;font-weight:700;line-height:1;color:${color};">${esc(card.grade)}</div>
        <div style="display:flex;font-size:14px;color:${color};letter-spacing:2px;margin-top:2px;font-weight:700;">CLAIM RECORD</div>
      </div>`
    : "";

  const leanBlock =
    card.lean != null
      ? `<div style="display:flex;flex-direction:column;margin-left:${card.grade ? "20" : "0"}px;">
          <div style="display:flex;font-size:14px;letter-spacing:2px;color:${MUTED};font-weight:700;">IDEOLOGY</div>
          <div style="display:flex;font-size:26px;font-weight:700;margin-top:2px;">${esc(leanLabel(card.lean))}</div>
          ${leanBarMarkup(card.lean)}
        </div>`
      : "";

  const scoresRow =
    gradeStamp || leanBlock
      ? `<div style="display:flex;flex-direction:row;align-items:center;margin-top:16px;">
          ${gradeStamp}${leanBlock}
        </div>`
      : `<div style="display:flex;font-size:22px;color:${MUTED};margin-top:16px;line-height:1.35">Person scores pending — see graded appearances</div>`;

  return `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:40px 52px;border:16px solid ${INK}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
      <div style="display:flex;font-size:28px;font-weight:700;letter-spacing:5px">CLADFACTS</div>
      <div style="display:flex;font-size:18px;letter-spacing:3px;color:${MUTED};font-weight:700">POLITICIAN REPORT CARD</div>
    </div>
    <div style="display:flex;width:100%;height:4px;background:${INK};margin:14px 0 24px"></div>
    <div style="display:flex;flex-direction:row;align-items:flex-start;width:100%;flex:1">
      ${photoBlock}
      <div style="display:flex;flex-direction:column;margin-left:36px;flex:1;min-width:0">
        <div style="display:flex;font-size:18px;letter-spacing:4px;color:${RED};font-weight:700">${esc(raceLine)}</div>
        <div style="display:flex;font-size:52px;font-weight:700;line-height:1.05;margin-top:8px;max-width:760px">${esc(card.name)}</div>
        ${scoresRow}
        <div style="display:flex;font-size:24px;margin-top:18px;line-height:1.25;font-weight:700">${esc(reports)}</div>
      </div>
    </div>
    <div style="display:flex;margin-top:auto;justify-content:space-between;align-items:flex-end;width:100%;padding-top:16px">
      <div style="display:flex;border:3px solid ${RED};color:${RED};padding:10px 22px;font-size:18px;letter-spacing:2px;font-weight:700">FULL REPORT CARD</div>
      <div style="display:flex;font-size:18px;color:${MUTED};letter-spacing:2px">cladfacts.com/politicians</div>
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
