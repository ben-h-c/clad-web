import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { aggregateTopics, gradeToGpa, gpaToGrade, leanScoreOf } from "~/lib/topics";
import { getBreaking } from "~/lib/agents";
import { isNewsOutlet } from "~/lib/networks";
import { displayableThumb } from "~/lib/imagePolicy";
import { OG_VERSIONS, ogCacheKey, clip, OG, ogGradeColors, ogLeanBarMarkup } from "~/lib/ogCard";

export const prerender = false;

// Cache versioning lives in ~/lib/ogCard (OG_VERSIONS.post): the version is
// folded into the edge-cache key (instant invalidation on deploy) and posts
// reference /og/<slug>.png?v=N so social scrapers — which key their own
// caches on the URL — re-unfurl already-shared links with the new design.

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

function resolveLeanScore(score: number | null | undefined, lean?: string): number | null {
  return typeof score === "number" ? score : lean ? (ENUM_TO_SCORE[lean] ?? null) : null;
}

function leanLabel(score: number | null | undefined, lean?: string): string | null {
  const s = resolveLeanScore(score, lean);
  if (s === null) return null;
  return Math.abs(s) < 5 ? "Centered" : `${Math.abs(s)}% ${s > 0 ? "Right" : "Left"}-leaning`;
}

const esc = (s: unknown) => String(s ?? "").replace(/[<>]/g, " ");

interface Card {
  headline: string;
  badge: string;
  badgeLabel: string;
  lean: string | null;
  /** Numeric lean (−100…+100) driving the geometry bar's tick position. */
  leanScore: number | null;
  factuality: number | null;
  metaLine?: string;
  /** The most attention-worthy key moment (a contested claim when one exists)
   *  — rendered as the paper-on-ink pull quote in the top band. */
  moment?: { claim: string; verdict: string } | null;
  /** Absolute URL for the post/topic still (YouTube or /generated/), if any. */
  thumbUrl?: string | null;
}

function verdictChipColors(verdict: string): { bg: string; ink: string } {
  const v = verdict.toLowerCase();
  if (v === "verified") return { bg: OG.gradeABg, ink: OG.gradeAInk };
  if (v === "missing context") return { bg: OG.gradeBBg, ink: OG.gradeBInk };
  return { bg: OG.gradeBadBg, ink: OG.gradeBadInk };
}

/**
 * Post stills on OG cards: same source as site tiles (YouTube poster of the
 * reviewed video, or site-owned /generated/ art), gated by SHOW_VIDEO_STILLS
 * (docs/legal/image-claims.md). Bytes are fetched at render time and embedded
 * as a data URI for satori — not hotlinked.
 */
/** Human urgency label for the hook band — reads like a feed thumbnail. */
function hookKicker(verdict: string): string {
  const v = verdict.toLowerCase();
  if (v === "disputed") return "THEY SAID THIS. WE CHECKED.";
  if (v === "missing context") return "MISSING THE FULL STORY";
  if (v === "unsupported") return "NOT BACKED UP";
  if (v === "verified") return "THIS ONE CHECKED OUT";
  return "WE FACT-CHECKED THIS";
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

/** Fetch a still and return a data URI satori can embed, or null. */
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
      else if (bytes[0] === 0x52 && bytes[1] === 0x49) mime = "image/webp";
      else return null;
    }
    return arrayBufferToDataUri(buf, mime);
  } catch {
    return null;
  }
}

function markup(card: Card, thumbDataUri: string | null): string {
  const g = ogGradeColors(card.badge);
  const meta =
    card.metaLine != null
      ? card.metaLine
      : card.factuality != null
        ? `Factuality ${card.factuality}/100`
        : "";
  const badgeSize = card.badge.length <= 2 ? 72 : 36;
  const hClipped = clip(card.headline, thumbDataUri ? 90 : 120);
  const hSize = hClipped.length > 70 ? 32 : 40;

  const factLine =
    card.factuality != null
      ? `<div style="display:flex;font-size:16px;color:${MUTED};margin-top:8px;font-weight:600;">Factuality ${card.factuality}/100</div>`
      : "";
  const subLine =
    card.metaLine != null
      ? `<div style="display:flex;font-size:16px;color:${MUTED};margin-top:8px;">${esc(card.metaLine)}</div>`
      : "";
  const leanLine =
    card.lean && card.leanScore != null
      ? `<div style="display:flex;font-size:24px;font-weight:700;color:${INK};">${esc(card.lean)}</div>
       ${ogLeanBarMarkup(card.leanScore, 320)}
       ${factLine}${subLine}`
      : meta
        ? `<div style="display:flex;font-size:18px;color:${MUTED};font-weight:600;">${esc(meta)}</div>`
        : "";

  const hook =
    card.moment?.claim
      ? (() => {
          const v = card.moment!.verdict.toUpperCase();
          const chip = verdictChipColors(card.moment!.verdict);
          const q = clip(card.moment!.claim, thumbDataUri ? 95 : 120);
          return `<div style="display:flex;flex-direction:column;margin-bottom:14px;">
            <div style="display:flex;align-items:center;margin-bottom:10px;">
              <div style="display:flex;font-size:14px;color:${MUTED};letter-spacing:1px;font-weight:700;">${esc(hookKicker(card.moment!.verdict))}</div>
              <div style="display:flex;margin-left:12px;padding:6px 14px;border-radius:999px;background:${chip.bg};font-size:14px;font-weight:700;color:${chip.ink};">${esc(v)}</div>
            </div>
            <div style="display:flex;font-size:24px;font-weight:700;line-height:1.25;color:${INK};">“${esc(q)}”</div>
          </div>`;
        })()
      : `<div style="display:flex;font-size:14px;color:${ACCENT};letter-spacing:1px;font-weight:700;margin-bottom:12px;">FACT-CHECKED · GRADED · BIAS-RATED</div>`;

  const gradeStamp = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:999px;padding:14px 20px;margin-right:18px;background:${g.bg};min-width:88px;min-height:88px;">
    <div style="display:flex;font-size:${badgeSize}px;font-weight:700;line-height:1;color:${g.ink};">${esc(card.badge)}</div>
    <div style="display:flex;font-size:12px;color:${g.ink};letter-spacing:1px;margin-top:4px;font-weight:700;">${esc(card.badgeLabel)}</div>
  </div>`;

  const bodyRight = `<div style="display:flex;flex-direction:column;flex:1;padding:24px 28px 16px;justify-content:space-between;min-width:0;">
    ${hook}
    <div style="display:flex;align-items:center;">
      ${gradeStamp}
      <div style="display:flex;flex-direction:column;">${leanLine}</div>
    </div>
    <div style="display:flex;font-size:${hSize}px;font-weight:700;line-height:1.15;margin-top:14px;color:${INK};">${esc(hClipped)}</div>
  </div>`;

  const mid = thumbDataUri
    ? `<div style="display:flex;flex:1;flex-direction:row;min-height:0;">
        <div style="display:flex;width:440px;height:100%;overflow:hidden;border-radius:16px;margin:16px 0 16px 16px;background:${INK};">
          <img src="${thumbDataUri}" width="440" height="470" style="object-fit:cover;width:440px;height:470px;" />
        </div>
        ${bodyRight}
      </div>`
    : `<div style="display:flex;flex:1;flex-direction:column;min-height:0;">
        ${bodyRight}
      </div>`;

  return `
  <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;padding:28px;">
    <div style="display:flex;flex-direction:column;flex:1;background:${CARD};border-radius:24px;border:1px solid ${OG.rule};overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 28px;height:52px;">
        <div style="display:flex;font-size:26px;font-weight:700;letter-spacing:-0.5px;color:${INK};">CladFacts</div>
        <div style="display:flex;font-size:13px;color:${ACCENT};letter-spacing:1px;font-weight:700;background:${OG.accentSoft};padding:6px 14px;border-radius:999px;">REPORT CARD</div>
      </div>
      ${mid}
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 28px;height:52px;background:${OG.accentSoft};">
        <div style="display:flex;font-size:16px;font-weight:700;color:${ACCENT};">Open for full receipts →</div>
        <div style="display:flex;font-size:16px;color:${MUTED};font-weight:600;">cladfacts.com</div>
      </div>
    </div>
  </div>`;
}

// Default brand card for pages without a specific image (homepage, about, etc.)
// so link unfurls (X/Twitter, etc.) always show a large preview.
function brandMarkup(): string {
  return `
  <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;align-items:center;justify-content:center;padding:40px;">
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:${CARD};border-radius:28px;border:1px solid ${OG.rule};padding:48px;">
      <div style="display:flex;font-size:18px;color:${ACCENT};letter-spacing:2px;font-weight:700;background:${OG.accentSoft};padding:8px 18px;border-radius:999px;">WE GRADE THE NEWS</div>
      <div style="display:flex;font-size:96px;font-weight:700;letter-spacing:-2px;line-height:1;margin:22px 0 12px;color:${INK};">CladFacts</div>
      <div style="display:flex;width:120px;height:4px;background:${ACCENT};border-radius:999px;"></div>
      <div style="display:flex;font-size:32px;font-weight:600;margin-top:28px;line-height:1.3;width:860px;justify-content:center;text-align:center;color:${MUTED};">Every claim. Graded. Bias-rated. Receipts.</div>
      <div style="display:flex;margin-top:36px;background:${ACCENT};color:#FFFFFF;padding:14px 32px;font-size:20px;letter-spacing:1px;font-weight:700;border-radius:999px;">FREE TO READ · FREE TO SHARE</div>
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
  // ogCacheKey drops the query string (?anything must not fan out satori
  // renders) and folds OG_VERSIONS.post into a synthetic path segment so a
  // redesign deploy invalidates the edge instantly instead of aging out.
  const cacheKey = ogCacheKey(new URL(request.url), "post", OG_VERSIONS.post);
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

  const origin = new URL(request.url).origin;
  const fonts = await loadFonts(origin);
  const thumbDataUri = await loadThumbDataUri(card.thumbUrl, origin);

  const img = new ImageResponse(markup(card, thumbDataUri), {
    width: 1200,
    height: 630,
    fonts: fonts as any,
    format: "png",
  });
  // Post/topic cards are content-addressed by slug → long immutable TTL.
  // Breaking-group cards track a LIVE cluster (members join, averages move,
  // the group ages out) → short TTL so the card follows the story.
  const cacheControl = slug.startsWith("breaking-")
    ? "public, max-age=3600, s-maxage=3600"
    : "public, max-age=86400, s-maxage=604800, immutable";
  const resp = new Response(img.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": cacheControl,
    },
  });
  const cf = (locals as any)?.cfContext;
  if (cf?.waitUntil) cf.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
};

/** The band's pull quote: the most contested key moment, else the first. */
function pickMoment(
  keyMoments: { claim: string; verdict: string }[] | undefined
): Card["moment"] {
  const km = keyMoments ?? [];
  const m = km.find((x) => x.verdict !== "verified") ?? km[0];
  return m ? { claim: m.claim, verdict: m.verdict } : null;
}

function postThumbUrl(d: { thumbnail?: string; videoId?: string }): string | null {
  if (d.thumbnail) return d.thumbnail;
  if (d.videoId) return `https://img.youtube.com/vi/${d.videoId}/hqdefault.jpg`;
  return null;
}

async function buildCard(slug: string): Promise<Card | null> {
  const all = await getCollection("posts", (p) => !p.data.draft);

  if (slug.startsWith("topic-")) {
    const topicSlug = slug.slice("topic-".length);
    const t = aggregateTopics(all).find((x) => x.slug === topicSlug);
    if (!t) return null;
    const thumbPost = t.posts[0];
    return {
      headline: t.display,
      badge: t.avgGrade ?? "—",
      badgeLabel: "AVG GRADE",
      lean: leanLabel(t.avgLean, undefined),
      leanScore: resolveLeanScore(t.avgLean, undefined),
      factuality: null,
      metaLine: `TOPIC · ${t.count} ${t.count === 1 ? "REPORT" : "REPORTS"}`,
      thumbUrl: t.thumbnail || (thumbPost ? postThumbUrl(thumbPost.data) : null),
    };
  }

  // Developing-story hub card (mirrors breaking/[slug].astro's member logic).
  if (slug.startsWith("breaking-")) {
    const groupSlug = slug.slice("breaking-".length);
    const items = await getBreaking(env.AGENTS);
    const group = items.find((it) => it.type === "group" && it.slug === groupSlug);
    if (!group || group.type !== "group") return null;
    const byId = new Map(all.map((p) => [p.id, p]));
    const members = group.ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined && isNewsOutlet(p!.data.sourceTitle))
      .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
    if (members.length === 0) return null;
    const gpas = members.map((p) => gradeToGpa(p.data.letterGrade)).filter((n): n is number => n != null);
    const leans = members.map((p) => leanScoreOf(p.data)).filter((n): n is number => n != null);
    const avgLean = leans.length ? Math.round(leans.reduce((a, b) => a + b, 0) / leans.length) : null;
    return {
      headline: group.topic ?? group.title,
      badge: gpas.length ? gpaToGrade(gpas.reduce((a, b) => a + b, 0) / gpas.length) : "—",
      badgeLabel: "AVG GRADE",
      lean: avgLean != null ? leanLabel(avgLean) : null,
      leanScore: avgLean,
      factuality: null,
      metaLine: `DEVELOPING STORY · ${members.length} ${members.length === 1 ? "OUTLET" : "OUTLETS"} GRADED`,
      moment: pickMoment(members[0]!.data.keyMoments),
      thumbUrl: postThumbUrl(members[0]!.data),
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
    leanScore: isBroadcast ? resolveLeanScore(leanScoreOf(d), d.politicalLean) : null,
    factuality: isBroadcast && typeof d.factualityScore === "number" ? d.factualityScore : null,
    moment: isBroadcast ? pickMoment(d.keyMoments) : null,
    thumbUrl: postThumbUrl(d),
  };
}
