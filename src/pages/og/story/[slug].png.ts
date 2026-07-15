import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { leanScoreOf } from "~/lib/topics";
import { dateline } from "~/lib/dateline";

export const prerender = false;

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
  return Math.abs(s) < 5 ? "Centered" : `${Math.abs(s)}% ${s > 0 ? "Right" : "Left"}-leaning`;
}

const esc = (s: unknown) => String(s ?? "").replace(/[<>]/g, " ");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

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

function markup(card: StoryCard): string {
  const color = badgeColor(card);
  const badgeSize = card.badge.length > 2 ? 78 : 200;
  const meta = [card.lean ? "POLITICAL LEAN" : null, card.factuality != null ? `FACTUALITY ${card.factuality}/100` : null]
    .filter(Boolean)
    .join("    ·    ");
  const leanBlock = card.lean
    ? `<div style="display:flex;flex-direction:column;align-items:center;">
         <div style="display:flex;font-size:54px;font-weight:700;">${esc(card.lean)}</div>
         <div style="display:flex;font-size:24px;color:${MUTED};letter-spacing:5px;margin-top:10px;">${esc(meta)}</div>
       </div>`
    : meta
      ? `<div style="display:flex;font-size:26px;color:${MUTED};letter-spacing:5px;">${esc(meta)}</div>`
      : `<div style="display:flex;"></div>`;
  const momentsBlock = card.moments.length
    ? card.moments
        .map(
          (m) => `
      <div style="display:flex;flex-direction:column;">
        <div style="display:flex;">
          <div style="display:flex;font-size:22px;font-weight:700;letter-spacing:4px;color:${momentColor(m.verdict)};border:2px solid ${momentColor(m.verdict)};padding:7px 16px;">${esc(m.verdict.toUpperCase())}</div>
        </div>
        <div style="display:flex;font-size:34px;line-height:1.3;margin-top:14px;">${esc(clip(m.claim, 140))}</div>
      </div>`
        )
        .join("")
    : `<div style="display:flex;font-size:36px;line-height:1.4;color:${INK};">${esc(clip(card.summary, 240))}</div>`;

  return `
  <div style="display:flex;flex-direction:column;width:1080px;height:1920px;background:${PAPER};color:${INK};font-family:Playfair;">
    <div style="display:flex;flex-direction:column;align-items:center;padding:80px 60px 0;">
      <div style="display:flex;font-size:26px;color:${MUTED};letter-spacing:9px;">FACT-CHECKING THE NEWS</div>
      <div style="display:flex;font-size:132px;font-weight:700;letter-spacing:16px;line-height:1;margin:16px 0 22px;">CLAD</div>
      <div style="display:flex;width:640px;height:4px;background:${INK};"></div>
      <div style="display:flex;font-size:28px;color:${MUTED};letter-spacing:3px;margin-top:20px;">${esc(card.dateline)}</div>
    </div>
    <div style="display:flex;flex-direction:column;margin:36px 0 0;">
      <div style="display:flex;height:3px;background:${INK};"></div>
      <div style="display:flex;height:1px;background:${INK};margin-top:6px;"></div>
    </div>
    <div style="display:flex;flex-direction:column;flex:1;padding:56px 72px;justify-content:space-between;">
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="display:flex;flex-direction:column;align-items:center;border:7px solid ${color};padding:34px 56px;transform:rotate(-3deg);">
          <div style="display:flex;font-size:${badgeSize}px;font-weight:700;line-height:1;color:${color};">${esc(card.badge)}</div>
          <div style="display:flex;font-size:24px;letter-spacing:5px;color:${color};margin-top:14px;">${esc(card.badgeLabel)}</div>
        </div>
        <div style="display:flex;margin-top:36px;">${leanBlock}</div>
      </div>
      <div style="display:flex;font-size:62px;font-weight:700;line-height:1.14;">${esc(clip(card.headline, 110))}</div>
      <div style="display:flex;flex-direction:column;gap:34px;">${momentsBlock}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;padding:0 72px 70px;">
      <div style="display:flex;width:936px;height:3px;background:${INK};"></div>
      <div style="display:flex;font-size:26px;color:${MUTED};letter-spacing:5px;margin-top:26px;">${card.sourcesCount} ${card.sourcesCount === 1 ? "SOURCE" : "SOURCES"} CITED</div>
      <div style="display:flex;font-size:32px;font-weight:700;margin-top:14px;">cladfacts.com/posts/${esc(card.slug)}</div>
    </div>
  </div>`;
}

// Fonts are static assets; fetch + cache them in module scope (per isolate).
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
  // Cache is content-addressed by path only (no route reads query params), so drop
  // the query string — otherwise ?anything busts the cache and re-runs satori.
  const _u = new URL(request.url);
  const cacheKey = new Request(_u.origin + _u.pathname);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const card = await buildStoryCard(slug);
  if (!card) return new Response("Not found", { status: 404 });

  const fonts = await loadFonts(new URL(request.url).origin);

  const img = new ImageResponse(markup(card), {
    width: 1080,
    height: 1920,
    fonts: fonts as any,
    format: "png",
  });
  // Cache the bytes with a long, immutable TTL (cards are content-addressed by slug).
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

async function buildStoryCard(slug: string): Promise<StoryCard | null> {
  const all = await getCollection("posts", (p) => !p.data.draft);
  const post = all.find((p) => p.id === slug);
  if (!post) return null;
  const d = post.data;
  const isBroadcast = d.type === "broadcast";
  return {
    slug,
    headline: d.headline,
    badge: isBroadcast ? d.letterGrade ?? "—" : VERDICT_LABELS[d.verdict ?? ""] ?? "—",
    badgeLabel: isBroadcast ? "ARTICLE GRADE" : "VERDICT",
    lean: isBroadcast ? leanLabel(leanScoreOf(d), d.politicalLean) : null,
    factuality: isBroadcast && typeof d.factualityScore === "number" ? d.factualityScore : null,
    dateline: dateline(d.publishedAt),
    moments: d.keyMoments.slice(0, 3).map((m) => ({ claim: m.claim, verdict: m.verdict })),
    summary: d.summary,
    sourcesCount: d.citations.length,
  };
}
