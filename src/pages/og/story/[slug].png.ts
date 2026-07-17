import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { leanScoreOf } from "~/lib/topics";
import { dateline } from "~/lib/dateline";
import { displayableThumb } from "~/lib/imagePolicy";
import { OG_VERSIONS, ogCacheKey, clip } from "~/lib/ogCard";

export const prerender = false;

/** 9:16 story card for system share / Stories — designed to stop the scroll. */

const PAPER = "#F5EDD9";
const INK = "#1A140D";
const MUTED = "#6E5E4D";
const RED = "#941A1A";

const VERDICT_LABELS: Record<string, string> = {
  true: "True", "mostly-true": "Mostly True", mixed: "Mixed",
  "mostly-false": "Mostly False", false: "False", unverified: "Unverified",
};
const ENUM_TO_SCORE: Record<string, number> = {
  left: -80, "center-left": -40, center: 0, "center-right": 40, right: 80, none: 0,
};

function leanLabel(score: number | null | undefined, lean?: string): string | null {
  const s = typeof score === "number" ? score : lean ? (ENUM_TO_SCORE[lean] ?? null) : null;
  if (s === null) return null;
  return Math.abs(s) < 5 ? "Centered" : `${Math.abs(s)}% ${s > 0 ? "Right" : "Left"}`;
}

const esc = (s: unknown) => String(s ?? "").replace(/[<>]/g, " ");

interface Moment {
  claim: string;
  verdict: string;
}

interface StoryCard {
  slug: string;
  headline: string;
  badge: string;
  badgeLabel: string;
  lean: string | null;
  factuality: number | null;
  dateline: string;
  moments: Moment[];
  summary: string;
  sourcesCount: number;
  thumbUrl?: string | null;
}

function badgeColor(card: StoryCard): string {
  if (card.badgeLabel === "VERDICT") {
    if (card.badge === "True" || card.badge === "Mostly True") return INK;
    if (card.badge === "Mixed" || card.badge === "Unverified") return MUTED;
    return RED;
  }
  const t = card.badge.charAt(0).toUpperCase();
  if (t === "A" || t === "B") return INK;
  if (t === "C") return MUTED;
  return RED;
}

function momentColor(verdict: string): string {
  if (verdict === "verified") return INK;
  if (verdict === "missing context") return MUTED;
  return RED;
}

function arrayBufferToDataUri(buf: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

async function loadThumbDataUri(rawUrl: string | null | undefined, origin: string): Promise<string | null> {
  const allowed = displayableThumb(rawUrl);
  if (!allowed) return null;
  let url = allowed;
  if (url.startsWith("/")) url = new URL(url, origin).href;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "CladFactsOG/1.0 (+https://cladfacts.com)", Accept: "image/*" },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 800 || buf.byteLength > 2_500_000) return null;
    const bytes = new Uint8Array(buf);
    let mime = (r.headers.get("content-type") || "").split(";")[0]?.trim() || "";
    if (!mime.startsWith("image/")) {
      if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = "image/png";
      else if (bytes[0] === 0xff && bytes[1] === 0xd8) mime = "image/jpeg";
      else return null;
    }
    return arrayBufferToDataUri(buf, mime);
  } catch {
    return null;
  }
}

function markup(card: StoryCard, thumbDataUri: string | null): string {
  const color = badgeColor(card);
  const badgeSize = card.badge.length > 2 ? 64 : 140;
  const meta = [
    card.lean ? card.lean.toUpperCase() : null,
    card.factuality != null ? `FACT ${card.factuality}/100` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  const ordered = [...card.moments].sort((a, b) => {
    const rank = (v: string) =>
      v === "disputed" ? 0 : v === "unsupported" ? 1 : v === "missing context" ? 2 : 3;
    return rank(a.verdict) - rank(b.verdict);
  });
  const top = ordered.slice(0, thumbDataUri ? 2 : 3);
  const momentsBlock = top.length
    ? top
        .map(
          (m) => `
      <div style="display:flex;flex-direction:column;margin-bottom:22px;">
        <div style="display:flex;">
          <div style="display:flex;font-size:22px;font-weight:700;letter-spacing:3px;color:${momentColor(m.verdict)};border:3px solid ${momentColor(m.verdict)};padding:6px 14px;">${esc(m.verdict.toUpperCase())}</div>
        </div>
        <div style="display:flex;font-size:32px;line-height:1.25;margin-top:10px;font-weight:700;">${esc(clip(m.claim, 100))}</div>
      </div>`
        )
        .join("")
    : `<div style="display:flex;font-size:34px;line-height:1.35;font-weight:700;">${esc(clip(card.summary, 180))}</div>`;

  const thumbBlock = thumbDataUri
    ? `<div style="display:flex;width:1080px;height:520px;overflow:hidden;border-bottom:4px solid ${INK};background:${INK};">
        <img src="${thumbDataUri}" width="1080" height="520" style="object-fit:cover;width:1080px;height:520px;" />
      </div>`
    : "";

  return `
  <div style="display:flex;flex-direction:column;width:1080px;height:1920px;background:${PAPER};color:${INK};font-family:Playfair;">
    <div style="display:flex;flex-direction:column;align-items:center;padding:48px 48px 0;">
      <div style="display:flex;font-size:24px;color:${MUTED};letter-spacing:6px;font-weight:700;">WE CHECKED THE CLAIMS</div>
      <div style="display:flex;font-size:72px;font-weight:700;letter-spacing:5px;line-height:1;margin:10px 0 12px;">CLADFACTS</div>
      <div style="display:flex;font-size:24px;color:${MUTED};letter-spacing:2px;">${esc(card.dateline)}</div>
    </div>
    ${thumbBlock}
    <div style="display:flex;flex-direction:column;align-items:center;margin:28px 0 0;">
      <div style="display:flex;flex-direction:column;align-items:center;border:7px solid ${color};padding:20px 40px;transform:rotate(-3deg);background:${PAPER};">
        <div style="display:flex;font-size:${badgeSize}px;font-weight:700;line-height:1;color:${color};">${esc(card.badge)}</div>
        <div style="display:flex;font-size:22px;letter-spacing:4px;color:${color};margin-top:8px;font-weight:700;">${esc(card.badgeLabel)}</div>
      </div>
      ${meta ? `<div style="display:flex;font-size:24px;color:${MUTED};letter-spacing:3px;margin-top:20px;font-weight:700;">${esc(meta)}</div>` : ""}
    </div>
    <div style="display:flex;flex-direction:column;flex:1;padding:28px 56px 0;">
      <div style="display:flex;font-size:44px;font-weight:700;line-height:1.12;margin-bottom:24px;">${esc(clip(card.headline, 80))}</div>
      <div style="display:flex;flex-direction:column;">${momentsBlock}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;padding:0 56px 56px;">
      <div style="display:flex;width:900px;height:4px;background:${INK};"></div>
      <div style="display:flex;font-size:26px;color:${RED};letter-spacing:3px;margin-top:22px;font-weight:700;">FULL RECEIPTS ON THE SITE</div>
      <div style="display:flex;font-size:28px;font-weight:700;margin-top:10px;">cladfacts.com</div>
      <div style="display:flex;font-size:20px;color:${MUTED};margin-top:6px;">${card.sourcesCount} sources cited</div>
    </div>
  </div>`;
}

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

export const GET: APIRoute = async ({ params, request, locals }) => {
  const slug = String(params.slug ?? "");
  const cache = (caches as any).default as Cache;
  const cacheKey = ogCacheKey(new URL(request.url), "story", OG_VERSIONS.story);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const all = await getCollection("posts", (p) => !p.data.draft);
  const post = all.find((p) => p.id === slug);
  if (!post) return new Response("Not found", { status: 404 });
  const d = post.data;
  const isBroadcast = d.type === "broadcast";
  const thumbUrl =
    d.thumbnail ||
    (d.videoId ? `https://img.youtube.com/vi/${d.videoId}/hqdefault.jpg` : null);
  const card: StoryCard = {
    slug: post.id,
    headline: d.headline,
    badge: isBroadcast ? d.letterGrade ?? "—" : VERDICT_LABELS[d.verdict ?? ""] ?? "—",
    badgeLabel: isBroadcast ? "ARTICLE GRADE" : "VERDICT",
    lean: isBroadcast ? leanLabel(leanScoreOf(d), d.politicalLean) : null,
    factuality: isBroadcast && typeof d.factualityScore === "number" ? d.factualityScore : null,
    dateline: dateline(d.publishedAt),
    moments: (d.keyMoments ?? []).slice(0, 4).map((m) => ({ claim: m.claim, verdict: m.verdict })),
    summary: d.summary,
    sourcesCount: (d.sources ?? []).length || (d.citations ?? []).length,
    thumbUrl,
  };

  const origin = new URL(request.url).origin;
  const fonts = await loadFonts(origin);
  const thumbDataUri = await loadThumbDataUri(card.thumbUrl, origin);
  const img = new ImageResponse(markup(card, thumbDataUri), {
    width: 1080,
    height: 1920,
    fonts: fonts as any,
    format: "png",
  });
  const resp = new Response(img.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
  const cf = (locals as any)?.cfContext;
  if (cf?.waitUntil) cf.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
};
