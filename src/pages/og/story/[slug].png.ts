import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { leanScoreOf } from "~/lib/topics";
import { dateline } from "~/lib/dateline";

export const prerender = false;

/** 9:16 story card for Instagram / TikTok / Stories — designed to stop the scroll. */

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
  const badgeSize = card.badge.length > 2 ? 72 : 180;
  const meta = [
    card.lean ? card.lean.toUpperCase() : null,
    card.factuality != null ? `FACT ${card.factuality}/100` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  // Lead with the most contested claim (scroll-stopper), then 1–2 more.
  const ordered = [...card.moments].sort((a, b) => {
    const rank = (v: string) =>
      v === "disputed" ? 0 : v === "unsupported" ? 1 : v === "missing context" ? 2 : 3;
    return rank(a.verdict) - rank(b.verdict);
  });
  const top = ordered.slice(0, 3);
  const momentsBlock = top.length
    ? top
        .map(
          (m) => `
      <div style="display:flex;flex-direction:column;margin-bottom:28px;">
        <div style="display:flex;">
          <div style="display:flex;font-size:24px;font-weight:700;letter-spacing:3px;color:${momentColor(m.verdict)};border:3px solid ${momentColor(m.verdict)};padding:8px 16px;">${esc(m.verdict.toUpperCase())}</div>
        </div>
        <div style="display:flex;font-size:36px;line-height:1.25;margin-top:12px;font-weight:700;">${esc(clip(m.claim, 110))}</div>
      </div>`
        )
        .join("")
    : `<div style="display:flex;font-size:38px;line-height:1.35;font-weight:700;">${esc(clip(card.summary, 200))}</div>`;

  return `
  <div style="display:flex;flex-direction:column;width:1080px;height:1920px;background:${PAPER};color:${INK};font-family:Playfair;">
    <div style="display:flex;flex-direction:column;align-items:center;padding:64px 56px 0;">
      <div style="display:flex;font-size:28px;color:${MUTED};letter-spacing:6px;font-weight:700;">WE CHECKED THE CLAIMS</div>
      <div style="display:flex;font-size:96px;font-weight:700;letter-spacing:6px;line-height:1;margin:12px 0 16px;">CLADFACTS</div>
      <div style="display:flex;width:560px;height:4px;background:${INK};"></div>
      <div style="display:flex;font-size:26px;color:${MUTED};letter-spacing:2px;margin-top:16px;">${esc(card.dateline)}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;margin:40px 0 0;">
      <div style="display:flex;flex-direction:column;align-items:center;border:8px solid ${color};padding:28px 48px;transform:rotate(-3deg);background:${PAPER};">
        <div style="display:flex;font-size:${badgeSize}px;font-weight:700;line-height:1;color:${color};">${esc(card.badge)}</div>
        <div style="display:flex;font-size:26px;letter-spacing:4px;color:${color};margin-top:10px;font-weight:700;">${esc(card.badgeLabel)}</div>
      </div>
      ${meta ? `<div style="display:flex;font-size:28px;color:${MUTED};letter-spacing:3px;margin-top:28px;font-weight:700;">${esc(meta)}</div>` : ""}
    </div>
    <div style="display:flex;flex-direction:column;flex:1;padding:40px 64px 0;">
      <div style="display:flex;font-size:52px;font-weight:700;line-height:1.12;margin-bottom:36px;">${esc(clip(card.headline, 90))}</div>
      <div style="display:flex;flex-direction:column;">${momentsBlock}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;padding:0 64px 72px;">
      <div style="display:flex;width:920px;height:4px;background:${INK};"></div>
      <div style="display:flex;font-size:28px;color:${RED};letter-spacing:3px;margin-top:28px;font-weight:700;">FULL RECEIPTS ON THE SITE</div>
      <div style="display:flex;font-size:30px;font-weight:700;margin-top:12px;">cladfacts.com</div>
      <div style="display:flex;font-size:22px;color:${MUTED};margin-top:8px;">${card.sourcesCount} sources cited</div>
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
  const _u = new URL(request.url);
  const cacheKey = new Request(_u.origin + "/__story-v2" + _u.pathname);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const all = await getCollection("posts", (p) => !p.data.draft);
  const post = all.find((p) => p.id === slug);
  if (!post) return new Response("Not found", { status: 404 });
  const d = post.data;
  const isBroadcast = d.type === "broadcast";
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
    sourcesCount: (d.sources ?? []).length,
  };

  const fonts = await loadFonts(new URL(request.url).origin);
  const img = new ImageResponse(markup(card), {
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
