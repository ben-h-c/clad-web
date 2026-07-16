import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { ImageResponse } from "workers-og";
import { aggregateTopics, gradeToGpa, gpaToGrade, leanScoreOf } from "~/lib/topics";
import { getBreaking } from "~/lib/agents";
import { isNewsOutlet } from "~/lib/networks";

export const prerender = false;

// Bump on any card redesign: the version is folded into the edge-cache key
// (instant invalidation on deploy) and posts reference /og/<slug>.png?v=N so
// social scrapers — which key their own caches on the URL — re-unfurl
// already-shared links with the new design.
const CARD_VERSION = "2";

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
 * Top band. Licensing: never bake third-party imagery into a PNG we serve
 * from our own domain — broadcasters' video stills can contain licensed wire
 * photos (docs/legal/image-claims.md). Instead of the old empty ink band, the
 * space now carries the card's strongest hook: the actual claim we checked,
 * set paper-on-ink like a letterpress pull quote. Cards without a key moment
 * (topics, verdict posts, breaking groups without one) get the masthead
 * tagline treatment so the band is never dead space.
 */
function bandBlock(card: Card): string {
  if (card.moment?.claim) {
    const v = card.moment.verdict.toUpperCase();
    const chipColor = verdictChipColor(card.moment.verdict);
    const q = clip(card.moment.claim, 150);
    const qSize = q.length > 90 ? 34 : 40;
    return `<div style="display:flex;flex-direction:column;justify-content:center;width:1200px;height:240px;background:${INK};padding:0 44px;">
      <div style="display:flex;align-items:center;margin-bottom:18px;">
        <div style="display:flex;font-size:20px;color:${PAPER};opacity:0.75;letter-spacing:6px;">FROM THIS BROADCAST</div>
        <div style="display:flex;margin-left:24px;padding:6px 14px;border:2px solid ${chipColor};font-size:20px;letter-spacing:3px;color:${chipColor};">${esc(v)}</div>
      </div>
      <div style="display:flex;font-size:${qSize}px;font-weight:700;line-height:1.18;color:${PAPER};">“${esc(q)}”</div>
    </div>`;
  }
  return `<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;width:1200px;height:240px;background:${INK};">
    <div style="display:flex;font-size:26px;color:${PAPER};opacity:0.75;letter-spacing:9px;">FACT-CHECKED · GRADED · RATED FOR BIAS</div>
    <div style="display:flex;width:520px;height:2px;background:${PAPER};opacity:0.4;margin:22px 0;"></div>
    <div style="display:flex;font-size:44px;font-weight:700;letter-spacing:5px;color:${PAPER};">THE REPORT CARD</div>
  </div>`;
}

function markup(card: Card): string {
  const color = gradeColor(card.badge);
  const meta =
    card.metaLine != null
      ? card.metaLine
      : [card.lean ? "POLITICAL LEAN" : null, card.factuality != null ? `FACTUALITY ${card.factuality}/100` : null]
          .filter(Boolean)
          .join("    ·    ");
  // Timeline legibility: a 1200px card renders ~500px wide in a feed (0.42
  // scale) — the grade and headline must survive that. Letter grades get the
  // full 130px treatment; word badges ("Mostly False") stay smaller.
  const badgeSize = card.badge.length <= 2 ? 130 : 56;
  const hClipped = clip(card.headline, 140);
  const hSize = hClipped.length > 78 ? 40 : 48;
  const leanBlock = card.lean
    ? `<div style="display:flex;flex-direction:column;">
         <div style="display:flex;font-size:44px;font-weight:700;">${esc(card.lean)}</div>
         <div style="display:flex;font-size:24px;color:${MUTED};letter-spacing:2px;margin-top:8px;">${esc(meta)}</div>
       </div>`
    : meta
      ? `<div style="display:flex;font-size:26px;color:${MUTED};letter-spacing:2px;">${esc(meta)}</div>`
      : `<div style="display:flex;"></div>`;

  return `
  <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 44px;height:70px;border-bottom:4px solid ${INK};">
      <div style="display:flex;font-size:40px;font-weight:700;letter-spacing:8px;">CLAD</div>
      <div style="display:flex;font-size:24px;color:${MUTED};letter-spacing:3px;">CLADFACTS.COM</div>
    </div>
    <div style="display:flex;width:1200px;height:240px;border-bottom:1px solid ${INK};">${bandBlock(card)}</div>
    <div style="display:flex;flex-direction:column;flex:1;padding:24px 44px;justify-content:space-between;">
      <div style="display:flex;align-items:center;">
        <div style="display:flex;flex-direction:column;align-items:center;margin-right:34px;">
          <div style="display:flex;font-size:${badgeSize}px;font-weight:700;line-height:1;color:${color};">${esc(card.badge)}</div>
          <div style="display:flex;font-size:22px;color:${MUTED};letter-spacing:3px;margin-top:6px;">${esc(card.badgeLabel)}</div>
        </div>
        <div style="display:flex;width:1px;height:120px;background:${INK};margin-right:34px;"></div>
        ${leanBlock}
      </div>
      <div style="display:flex;font-size:${hSize}px;font-weight:700;line-height:1.12;">${esc(hClipped)}</div>
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

  const fonts = await loadFonts(new URL(request.url).origin);

  const img = new ImageResponse(markup(card), {
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
  };
}
