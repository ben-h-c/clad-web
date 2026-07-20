import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { leanScoreOf } from "~/lib/topics";
import { dateline } from "~/lib/dateline";
import { displayableThumb } from "~/lib/imagePolicy";
import { OG_VERSIONS, ogCacheKey, clip, OG, ogGradeColors } from "~/lib/ogCard";

export const prerender = false;

/** 9:16 story card for system share / Stories — soft neutral design. */

const PAPER = OG.paper;
const INK = OG.ink;
const MUTED = OG.muted;
const ACCENT = OG.accent;
const CARD = OG.card;

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

function momentColors(verdict: string): { bg: string; ink: string } {
  if (verdict === "verified") return { bg: OG.gradeABg, ink: OG.gradeAInk };
  if (verdict === "missing context") return { bg: OG.gradeBBg, ink: OG.gradeBInk };
  return { bg: OG.gradeBadBg, ink: OG.gradeBadInk };
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
  const g = ogGradeColors(card.badge);
  const badgeSize = card.badge.length > 2 ? 56 : 110;
  const meta = [
    card.lean ? card.lean : null,
    card.factuality != null ? `Fact ${card.factuality}/100` : null,
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
        .map((m) => {
          const mc = momentColors(m.verdict);
          return `
      <div style="display:flex;flex-direction:column;margin-bottom:20px;background:${CARD};border-radius:18px;padding:18px 20px;border:1px solid ${OG.rule};">
        <div style="display:flex;">
          <div style="display:flex;font-size:18px;font-weight:700;letter-spacing:1px;color:${mc.ink};background:${mc.bg};padding:6px 14px;border-radius:999px;">${esc(m.verdict.toUpperCase())}</div>
        </div>
        <div style="display:flex;font-size:28px;line-height:1.3;margin-top:12px;font-weight:700;color:${INK};">${esc(clip(m.claim, 100))}</div>
      </div>`;
        })
        .join("")
    : `<div style="display:flex;font-size:30px;line-height:1.4;font-weight:600;color:${MUTED};">${esc(clip(card.summary, 180))}</div>`;

  const thumbBlock = thumbDataUri
    ? `<div style="display:flex;width:968px;height:480px;overflow:hidden;border-radius:20px;background:${INK};margin:0 0 8px;">
        <img src="${thumbDataUri}" width="968" height="480" style="object-fit:cover;width:968px;height:480px;" />
      </div>`
    : "";

  return `
  <div style="display:flex;flex-direction:column;width:1080px;height:1920px;background:${PAPER};color:${INK};font-family:Playfair;padding:40px 36px;">
    <div style="display:flex;flex-direction:column;flex:1;background:${CARD};border-radius:28px;border:1px solid ${OG.rule};padding:40px 36px;align-items:center;">
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="display:flex;font-size:16px;color:${ACCENT};letter-spacing:1px;font-weight:700;background:${OG.accentSoft};padding:8px 16px;border-radius:999px;">WE CHECKED THE CLAIMS</div>
        <div style="display:flex;font-size:56px;font-weight:700;letter-spacing:-1px;line-height:1;margin:14px 0 10px;color:${INK};">CladFacts</div>
        <div style="display:flex;font-size:20px;color:${MUTED};">${esc(card.dateline)}</div>
      </div>
      ${thumbBlock ? `<div style="display:flex;margin-top:28px;">${thumbBlock}</div>` : ""}
      <div style="display:flex;flex-direction:column;align-items:center;margin:28px 0 0;">
        <div style="display:flex;flex-direction:column;align-items:center;border-radius:999px;padding:22px 36px;background:${g.bg};min-width:160px;">
          <div style="display:flex;font-size:${badgeSize}px;font-weight:700;line-height:1;color:${g.ink};">${esc(card.badge)}</div>
          <div style="display:flex;font-size:16px;letter-spacing:1px;color:${g.ink};margin-top:6px;font-weight:700;">${esc(card.badgeLabel)}</div>
        </div>
        ${meta ? `<div style="display:flex;font-size:20px;color:${MUTED};margin-top:18px;font-weight:600;">${esc(meta)}</div>` : ""}
      </div>
      <div style="display:flex;flex-direction:column;flex:1;padding:28px 12px 0;width:100%;">
        <div style="display:flex;font-size:40px;font-weight:700;line-height:1.15;margin-bottom:22px;color:${INK};">${esc(clip(card.headline, 80))}</div>
        <div style="display:flex;flex-direction:column;">${momentsBlock}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;padding:12px 0 0;">
        <div style="display:flex;width:120px;height:4px;background:${ACCENT};border-radius:999px;"></div>
        <div style="display:flex;font-size:22px;color:${ACCENT};margin-top:20px;font-weight:700;">Full receipts on the site</div>
        <div style="display:flex;font-size:26px;font-weight:700;margin-top:8px;color:${INK};">cladfacts.com</div>
        <div style="display:flex;font-size:18px;color:${MUTED};margin-top:6px;">${card.sourcesCount} sources cited</div>
      </div>
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
