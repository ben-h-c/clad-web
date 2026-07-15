import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { aggregateTopics, leanScoreOf } from "~/lib/topics";

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

interface Card {
  headline: string;
  badge: string;
  badgeLabel: string;
  lean: string | null;
  factuality: number | null;
  metaLine?: string;
}

function gradeColor(badge: string): string {
  const t = (badge || "").charAt(0).toUpperCase();
  if (t === "A" || t === "B") return INK;
  if (t === "C") return MUTED;
  return RED;
}

function markup(card: Card): string {
  const color = gradeColor(card.badge);
  const meta =
    card.metaLine != null
      ? card.metaLine
      : [card.lean ? "POLITICAL LEAN" : null, card.factuality != null ? `FACTUALITY ${card.factuality}/100` : null]
          .filter(Boolean)
          .join("    ·    ");
  // Licensing: never bake third-party imagery into a PNG we serve from our
  // own domain — broadcasters' video stills can contain licensed wire photos.
  // Cards always use the ink band that was already the no-thumbnail fallback;
  // see docs/legal/image-claims.md.
  const thumbBlock = `<div style="display:flex;width:1200px;height:286px;background:${INK};"></div>`;
  const leanBlock = card.lean
    ? `<div style="display:flex;flex-direction:column;">
         <div style="display:flex;font-size:40px;font-weight:700;">${esc(card.lean)}</div>
         <div style="display:flex;font-size:18px;color:${MUTED};letter-spacing:3px;margin-top:6px;">${esc(meta)}</div>
       </div>`
    : meta
      ? `<div style="display:flex;font-size:20px;color:${MUTED};letter-spacing:3px;">${esc(meta)}</div>`
      : `<div style="display:flex;"></div>`;

  return `
  <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 44px;height:70px;border-bottom:4px solid ${INK};">
      <div style="display:flex;font-size:40px;font-weight:700;letter-spacing:8px;">CLAD</div>
      <div style="display:flex;font-size:20px;color:${MUTED};letter-spacing:2px;">CLADFACTS.COM · GRADING CONTENT & EXPOSING BIAS</div>
    </div>
    <div style="display:flex;width:1200px;height:286px;border-bottom:1px solid ${INK};">${thumbBlock}</div>
    <div style="display:flex;flex-direction:column;flex:1;padding:26px 44px;justify-content:space-between;">
      <div style="display:flex;align-items:center;">
        <div style="display:flex;flex-direction:column;align-items:center;margin-right:34px;">
          <div style="display:flex;font-size:92px;font-weight:700;line-height:1;color:${color};">${esc(card.badge)}</div>
          <div style="display:flex;font-size:18px;color:${MUTED};letter-spacing:3px;margin-top:6px;">${esc(card.badgeLabel)}</div>
        </div>
        <div style="display:flex;width:1px;height:96px;background:${INK};margin-right:34px;"></div>
        ${leanBlock}
      </div>
      <div style="display:flex;font-size:38px;font-weight:700;line-height:1.12;">${esc(card.headline)}</div>
    </div>
  </div>`;
}

// Default brand card for pages without a specific image (homepage, about, etc.)
// so link unfurls (X/Twitter, etc.) always show a large preview.
function brandMarkup(): string {
  return `
  <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;align-items:center;justify-content:center;text-align:center;">
    <div style="display:flex;font-size:28px;color:${MUTED};letter-spacing:10px;">FACT-CHECKING THE NEWS</div>
    <div style="display:flex;font-size:190px;font-weight:700;letter-spacing:16px;line-height:1;margin:14px 0;">CLAD</div>
    <div style="display:flex;width:740px;height:4px;background:${INK};"></div>
    <div style="display:flex;font-size:32px;color:${MUTED};letter-spacing:4px;margin-top:22px;">GRADING CONTENT & EXPOSING BIAS</div>
    <div style="display:flex;font-size:25px;color:${INK};margin-top:28px;width:880px;justify-content:center;line-height:1.3;">AI-assisted fact-checks that grade the news for accuracy and rate its political bias.</div>
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

  // Branded default card (homepage / pages without their own image).
  if (slug === "brand") {
    const fonts = await loadFonts(new URL(request.url).origin);
    const img = new ImageResponse(brandMarkup(), { width: 1200, height: 630, fonts: fonts as any, format: "png" });
    const resp = new Response(img.body, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
    const cf = (locals as any)?.cfContext;
    if (cf?.waitUntil) cf.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  }

  const card = await buildCard(slug);
  if (!card) return new Response("Not found", { status: 404 });

  const fonts = await loadFonts(new URL(request.url).origin);

  const img = new ImageResponse(markup(card), {
    width: 1200,
    height: 630,
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

async function buildCard(slug: string): Promise<Card | null> {
  const all = await getCollection("posts", (p) => !p.data.draft);

  if (slug.startsWith("topic-")) {
    const topicSlug = slug.slice("topic-".length);
    const t = aggregateTopics(all).find((x) => x.slug === topicSlug);
    if (!t) return null;
    return {
      headline: t.display,
      badge: t.avgGrade ?? "—",
      badgeLabel: "AVG GRADE",
      lean: leanLabel(t.avgLean, undefined),
      factuality: null,
      metaLine: `TOPIC · ${t.count} ${t.count === 1 ? "REPORT" : "REPORTS"}`,
    };
  }

  const post = all.find((p) => p.id === slug);
  if (!post) return null;
  const d = post.data;
  const isBroadcast = d.type === "broadcast";
  return {
    headline: d.headline,
    badge: isBroadcast ? d.letterGrade ?? "—" : VERDICT_LABELS[d.verdict ?? ""] ?? "—",
    badgeLabel: isBroadcast ? "ARTICLE GRADE" : "VERDICT",
    lean: isBroadcast ? leanLabel(leanScoreOf(d), d.politicalLean) : null,
    factuality: isBroadcast && typeof d.factualityScore === "number" ? d.factualityScore : null,
  };
}
