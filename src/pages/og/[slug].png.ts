import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { aggregateTopics, gradeToGpa, gpaToGrade, leanScoreOf } from "~/lib/topics";
import { getBreaking } from "~/lib/agents";
import { isNewsOutlet } from "~/lib/networks";
import { displayableThumb } from "~/lib/imagePolicy";

export const prerender = false;

// Bump on any card redesign: the version is folded into the edge-cache key
// (instant invalidation on deploy) and posts reference /og/<slug>.png?v=N so
// social scrapers — which key their own caches on the URL — re-unfurl
// already-shared links with the new design.
const CARD_VERSION = "5";

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

interface Card {
  headline: string;
  badge: string;
  badgeLabel: string;
  lean: string | null;
  factuality: number | null;
  metaLine?: string;
  /** The most attention-worthy key moment (a contested claim when one exists)
   *  — rendered as the paper-on-ink pull quote in the top band. */
  moment?: { claim: string; verdict: string } | null;
  /** Absolute URL for the post/topic still (YouTube or /generated/), if any. */
  thumbUrl?: string | null;
}

function gradeColor(badge: string): string {
  const t = (badge || "").charAt(0).toUpperCase();
  if (t === "A" || t === "B") return INK;
  if (t === "C") return MUTED;
  return RED;
}

function verdictChipColor(verdict: string): string {
  return verdict.toLowerCase() === "verified" ? PAPER : "#E8B4B4";
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
  const color = gradeColor(card.badge);
  const meta =
    card.metaLine != null
      ? card.metaLine
      : [card.lean ? "POLITICAL LEAN" : null, card.factuality != null ? `FACTUALITY ${card.factuality}/100` : null]
          .filter(Boolean)
          .join("    ·    ");
  const badgeSize = card.badge.length <= 2 ? 96 : 44;
  const hClipped = clip(card.headline, thumbDataUri ? 90 : 120);
  const hSize = hClipped.length > 70 ? 34 : 42;

  const leanLine = card.lean
    ? `<div style="display:flex;font-size:28px;font-weight:700;">${esc(card.lean)}</div>
       <div style="display:flex;font-size:18px;color:${MUTED};letter-spacing:2px;margin-top:4px;">${esc(meta)}</div>`
    : meta
      ? `<div style="display:flex;font-size:20px;color:${MUTED};letter-spacing:2px;">${esc(meta)}</div>`
      : "";

  const hook =
    card.moment?.claim
      ? (() => {
          const v = card.moment!.verdict.toUpperCase();
          const chipColor = verdictChipColor(card.moment!.verdict);
          const q = clip(card.moment!.claim, thumbDataUri ? 95 : 120);
          return `<div style="display:flex;flex-direction:column;margin-bottom:14px;">
            <div style="display:flex;align-items:center;margin-bottom:10px;">
              <div style="display:flex;font-size:16px;color:${MUTED};letter-spacing:3px;font-weight:700;">${esc(hookKicker(card.moment!.verdict))}</div>
              <div style="display:flex;margin-left:14px;padding:5px 12px;border:2px solid ${chipColor};font-size:16px;letter-spacing:2px;font-weight:700;color:${color === RED ? RED : INK};border-color:${chipColor === PAPER ? INK : chipColor};">${esc(v)}</div>
            </div>
            <div style="display:flex;font-size:26px;font-weight:700;line-height:1.2;color:${INK};">“${esc(q)}”</div>
          </div>`;
        })()
      : `<div style="display:flex;font-size:18px;color:${MUTED};letter-spacing:4px;font-weight:700;margin-bottom:12px;">FACT-CHECKED · GRADED · BIAS-RATED</div>`;

  const gradeStamp = `<div style="display:flex;flex-direction:column;align-items:center;border:5px solid ${color};padding:8px 16px;margin-right:20px;background:${PAPER};">
    <div style="display:flex;font-size:${badgeSize}px;font-weight:700;line-height:1;color:${color};">${esc(card.badge)}</div>
    <div style="display:flex;font-size:16px;color:${color};letter-spacing:2px;margin-top:2px;font-weight:700;">${esc(card.badgeLabel)}</div>
  </div>`;

  const bodyRight = `<div style="display:flex;flex-direction:column;flex:1;padding:20px 28px 12px;justify-content:space-between;min-width:0;">
    ${hook}
    <div style="display:flex;align-items:center;">
      ${gradeStamp}
      <div style="display:flex;flex-direction:column;">${leanLine}</div>
    </div>
    <div style="display:flex;font-size:${hSize}px;font-weight:700;line-height:1.1;margin-top:12px;">${esc(hClipped)}</div>
  </div>`;

  const mid = thumbDataUri
    ? `<div style="display:flex;flex:1;flex-direction:row;min-height:0;border-bottom:3px solid ${INK};">
        <div style="display:flex;width:480px;height:470px;overflow:hidden;border-right:3px solid ${INK};background:${INK};">
          <img src="${thumbDataUri}" width="480" height="470" style="object-fit:cover;width:480px;height:470px;" />
        </div>
        ${bodyRight}
      </div>`
    : `<div style="display:flex;flex:1;flex-direction:column;min-height:0;border-bottom:3px solid ${INK};">
        ${bodyRight}
      </div>`;

  return `
  <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 36px;height:56px;border-bottom:4px solid ${INK};">
      <div style="display:flex;font-size:30px;font-weight:700;letter-spacing:5px;">CLADFACTS</div>
      <div style="display:flex;font-size:18px;color:${MUTED};letter-spacing:3px;font-weight:700;">REPORT CARD</div>
    </div>
    ${mid}
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 36px;height:48px;">
      <div style="display:flex;font-size:20px;font-weight:700;letter-spacing:2px;color:${RED};">TAP FOR THE FULL RECEIPTS</div>
      <div style="display:flex;font-size:18px;color:${MUTED};letter-spacing:2px;">cladfacts.com</div>
    </div>
  </div>`;
}

// Default brand card for pages without a specific image (homepage, about, etc.)
// so link unfurls (X/Twitter, etc.) always show a large preview.
function brandMarkup(): string {
  return `
  <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;align-items:center;justify-content:center;border:16px solid ${INK};">
    <div style="display:flex;font-size:26px;color:${MUTED};letter-spacing:8px;font-weight:700;">WE GRADE THE NEWS</div>
    <div style="display:flex;font-size:120px;font-weight:700;letter-spacing:8px;line-height:1;margin:18px 0 10px;">CLADFACTS</div>
    <div style="display:flex;width:640px;height:4px;background:${INK};"></div>
    <div style="display:flex;font-size:36px;font-weight:700;margin-top:28px;line-height:1.25;width:900px;justify-content:center;text-align:center;">Every claim. Graded. Bias-rated. Receipts.</div>
    <div style="display:flex;margin-top:36px;border:3px solid ${RED};color:${RED};padding:12px 28px;font-size:24px;letter-spacing:3px;font-weight:700;">FREE TO READ · FREE TO SHARE</div>
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
  // CARD_VERSION rides in a synthetic (never-served) path segment so a redesign
  // deploy invalidates the edge instantly instead of aging out over 7 days.
  const _u = new URL(request.url);
  const cacheKey = new Request(_u.origin + "/__og-v" + CARD_VERSION + _u.pathname);
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
    return {
      headline: group.topic ?? group.title,
      badge: gpas.length ? gpaToGrade(gpas.reduce((a, b) => a + b, 0) / gpas.length) : "—",
      badgeLabel: "AVG GRADE",
      lean: leans.length ? leanLabel(Math.round(leans.reduce((a, b) => a + b, 0) / leans.length)) : null,
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
    factuality: isBroadcast && typeof d.factualityScore === "number" ? d.factualityScore : null,
    moment: isBroadcast ? pickMoment(d.keyMoments) : null,
    thumbUrl: postThumbUrl(d),
  };
}
