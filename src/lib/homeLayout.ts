/**
 * Dynamic home layout — ordered sections + optional feature highlight.
 * Written by the home-layout-curator agent (Grok + web_search) into AGENTS KV.
 * Homepage falls back to DEFAULT_HOME_ORDER when missing or expired.
 */

export type HomeSectionId =
  | "guest-hero"
  | "feature-highlight"
  | "spotlight"
  | "app-promo"
  | "breaking"
  | "front-page"
  | "lean"
  | "calendar"
  | "topics"
  | "politician-spotlight"
  | "election-map"
  | "grades"
  | "today-history"
  | "human-spotlight"
  | "discover"
  | "good-news"
  | "quips"
  | "more-feed"
  | "more";

export type HomeHighlightVariant =
  | "event"
  | "feature"
  | "midterms"
  | "topic"
  | "urgent"
  | "default";

export type HomeHighlightAudience = "all" | "anon" | "signed-in";

export interface HomeLayoutHighlight {
  id: string;
  kicker: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  secondaryHref?: string;
  secondaryCta?: string;
  variant?: HomeHighlightVariant;
  audience?: HomeHighlightAudience;
  /**
   * Optional hero image (YouTube still or /generated/ art only).
   * When omitted, the home feature strip resolves a post thumbnail from href.
   */
  image?: string;
}

export interface HomeLayoutStore {
  generatedAt: string;
  /** ISO — after this, homepage ignores the agent layout. */
  expiresAt: string;
  /** Short desk note: why this layout (debug / admin). */
  reason: string;
  /** Preferred section order (partial OK; gaps filled from default). */
  order?: HomeSectionId[];
  /** Sections to hide this cycle (cannot hide fixed top, election-map, more). */
  hide?: HomeSectionId[];
  /** Optional full-width feature / current-events strip. */
  highlight?: HomeLayoutHighlight | null;
  /** Search queries the agent used (audit trail). */
  sourceQueries?: string[];
}

/**
 * Permanent top stack — never reordered or hidden by the layout curator.
 * Today → Breaking → Front Page → Coverage lean (nothing else between these).
 */
export const FIXED_HOME_TOP: HomeSectionId[] = [
  "feature-highlight",
  "breaking",
  "front-page",
  "lean",
];

/** Default top-to-bottom home stack (fixed top first, then flexible middle). */
export const DEFAULT_HOME_ORDER: HomeSectionId[] = [
  ...FIXED_HOME_TOP,
  "guest-hero",
  "spotlight",
  "app-promo",
  "calendar",
  "topics",
  "politician-spotlight",
  "election-map",
  "grades",
  "today-history",
  "human-spotlight",
  "discover",
  "good-news",
  "quips",
  "more-feed",
  "more",
];

/** Never hide these — core news, midterms map, daily feature strip, fixed top. */
const PROTECTED = new Set<HomeSectionId>([
  ...FIXED_HOME_TOP,
  "election-map",
  "more-feed", // infinite “Keep reading” near the bottom
  "more", // always last on the page (“Explore more”)
]);

const SECTION_SET = new Set<HomeSectionId>(DEFAULT_HOME_ORDER);

const ALLOWED_HREF =
  /^\/(posts|topics|bracket|elections|quiz|bias|discover|good-news|students|learn|week|trends|register|how-it-works|politicians|search|day|human-spotlight|grades|recent|newsletter|account|login|privacy|terms|about|press|corrections|verified|outlets|ballot)(\/|$|\?)/i;

export function isAllowedHomeHref(href: string): boolean {
  const h = String(href || "").trim();
  if (!h.startsWith("/") || h.startsWith("//")) return false;
  if (h.includes("://")) return false;
  return ALLOWED_HREF.test(h) || h === "/" || h.startsWith("/register");
}

export function isHomeSectionId(v: unknown): v is HomeSectionId {
  return typeof v === "string" && SECTION_SET.has(v as HomeSectionId);
}

function clip(s: string, n: number): string {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).trimEnd() + "…";
}

export function normalizeHomeHighlight(raw: unknown): HomeLayoutHighlight | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const href = String(o.href || "").trim();
  const title = clip(String(o.title || ""), 120);
  const body = clip(String(o.body || ""), 220);
  const cta = clip(String(o.cta || "Learn more"), 40);
  if (!title || !body || !href || !isAllowedHomeHref(href)) return null;

  const secondaryHref = o.secondaryHref ? String(o.secondaryHref).trim() : "";
  const secondaryCta = o.secondaryCta ? clip(String(o.secondaryCta), 40) : "";
  const variant = String(o.variant || "event") as HomeHighlightVariant;
  const audience = String(o.audience || "all") as HomeHighlightAudience;

  const okVariant: HomeHighlightVariant[] = [
    "event",
    "feature",
    "midterms",
    "topic",
    "urgent",
    "default",
  ];
  const okAudience: HomeHighlightAudience[] = ["all", "anon", "signed-in"];

  // Only allow known-safe image hosts (same policy as tiles / post thumbs).
  const rawImage = String(o.image || "").trim();
  const imageOk =
    rawImage &&
    (/^https:\/\/(img\.youtube\.com|i\.ytimg\.com)\//.test(rawImage) ||
      rawImage.startsWith("/generated/") ||
      rawImage.startsWith("https://cladfacts.com/generated/"));

  return {
    id: clip(String(o.id || `hl-${Date.now()}`), 64).replace(/\s+/g, "-") || "highlight",
    kicker: clip(String(o.kicker || "Now on CladFacts"), 48),
    title,
    body,
    href,
    cta,
    secondaryHref:
      secondaryHref && isAllowedHomeHref(secondaryHref) ? secondaryHref : undefined,
    secondaryCta: secondaryHref && secondaryCta ? secondaryCta : undefined,
    variant: okVariant.includes(variant) ? variant : "event",
    audience: okAudience.includes(audience) ? audience : "all",
    image: imageOk ? rawImage : undefined,
  };
}

export function normalizeHomeLayout(raw: unknown): HomeLayoutStore | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const generatedAt = String(o.generatedAt || "").trim();
  const expiresAt = String(o.expiresAt || "").trim();
  if (!generatedAt || !expiresAt) return null;
  if (Number.isNaN(Date.parse(expiresAt))) return null;

  const order = Array.isArray(o.order)
    ? (o.order.filter(isHomeSectionId) as HomeSectionId[])
    : undefined;
  const hide = Array.isArray(o.hide)
    ? (o.hide.filter(isHomeSectionId).filter((id) => !PROTECTED.has(id)) as HomeSectionId[])
    : undefined;

  const highlight =
    o.highlight === null
      ? null
      : o.highlight
        ? normalizeHomeHighlight(o.highlight)
        : undefined;

  const sourceQueries = Array.isArray(o.sourceQueries)
    ? o.sourceQueries.map((q) => String(q || "").trim()).filter(Boolean).slice(0, 8)
    : undefined;

  return {
    generatedAt,
    expiresAt,
    reason: clip(String(o.reason || ""), 280),
    order,
    hide,
    highlight: highlight === undefined ? undefined : highlight,
    sourceQueries,
  };
}

/** True when the store is present and not past expiresAt. */
export function isHomeLayoutFresh(
  store: HomeLayoutStore | null | undefined,
  now = new Date()
): store is HomeLayoutStore {
  if (!store?.expiresAt) return false;
  const exp = Date.parse(store.expiresAt);
  if (Number.isNaN(exp)) return false;
  return exp > now.getTime();
}

/**
 * Merge agent order with defaults. Protected sections cannot be hidden.
 * Unknown ids dropped; missing sections appended in default order.
 *
 * Permanent pins (ignore agent order/hide):
 *   1. feature-highlight (Today)
 *   2. breaking
 *   3. front-page
 *   4. lean (coverage lean — always under Front Page)
 * Everything else may be reordered/hidden by the curator.
 * “Explore more” (more) is always last.
 */
export function resolveHomeOrder(
  store: HomeLayoutStore | null | undefined,
  now = new Date()
): HomeSectionId[] {
  const fresh = isHomeLayoutFresh(store, now) ? store : null;
  const hide = new Set(fresh?.hide || []);
  for (const p of PROTECTED) hide.delete(p);
  // Fixed pins — never hide.
  for (const id of FIXED_HOME_TOP) hide.delete(id);
  hide.delete("more");
  hide.delete("more-feed");

  const fixed = new Set<HomeSectionId>(FIXED_HOME_TOP);
  const preferred = (fresh?.order || [])
    .filter(isHomeSectionId)
    .filter((id) => !fixed.has(id) && id !== "more" && id !== "more-feed");
  const seen = new Set<HomeSectionId>();
  const middle: HomeSectionId[] = [];

  for (const id of preferred) {
    if (seen.has(id) || hide.has(id)) continue;
    seen.add(id);
    middle.push(id);
  }
  for (const id of DEFAULT_HOME_ORDER) {
    if (fixed.has(id) || id === "more" || id === "more-feed") continue;
    if (seen.has(id) || hide.has(id)) continue;
    seen.add(id);
    middle.push(id);
  }

  // Fixed top + flexible middle + Keep reading feed + Explore more last.
  return [...FIXED_HOME_TOP, ...middle, "more-feed", "more"];
}

export function resolveHomeHighlight(
  store: HomeLayoutStore | null | undefined,
  opts: { signedIn: boolean; now?: Date }
): HomeLayoutHighlight | null {
  if (!isHomeLayoutFresh(store, opts.now)) return null;
  const h = store.highlight;
  if (!h) return null;
  const aud = h.audience || "all";
  if (aud === "anon" && opts.signedIn) return null;
  if (aud === "signed-in" && !opts.signedIn) return null;
  return h;
}

/** Max topic cards sprinkled through the home stack (never a single Topics block). */
export const HOME_TOPICS_SPREAD = 5;

/** One home stack entry: a normal section or a single interspersed topic card. */
export type HomeRenderItem =
  | { kind: "section"; id: HomeSectionId }
  | { kind: "topic"; topicIndex: number };

/** Deterministic 0..1 PRNG (mulberry32) for stable daily layout. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Drop the bulk "topics" section and interleave up to `maxTopics` single topic
 * cards into random gaps between other home sections.
 *
 * - Never breaks the FIXED_HOME_TOP stack (Today → Breaking → Front → Lean).
 * - Never places a topic after "more" (Explore more stays last).
 * - Placement is seeded (default: seed string) so a given day is stable.
 *
 * `topicCount` is how many topic cards are available; only the first
 * `min(maxTopics, topicCount)` indices (0..n-1) are used — caller passes
 * pre-ranked topics and reads them by `topicIndex`.
 */
export function interleaveHomeTopics(
  order: HomeSectionId[],
  topicCount: number,
  opts?: { maxTopics?: number; seed?: string }
): HomeRenderItem[] {
  const maxTopics = Math.max(0, Math.min(HOME_TOPICS_SPREAD, opts?.maxTopics ?? HOME_TOPICS_SPREAD));
  const n = Math.max(0, Math.min(maxTopics, topicCount | 0));

  // Strip bulk topics block — individual inserts replace it.
  const sections = order.filter((id) => id !== "topics");
  const items: HomeRenderItem[] = sections.map((id) => ({ kind: "section" as const, id }));

  if (n === 0 || items.length < 2) return items;

  const fixed = new Set<HomeSectionId>(FIXED_HOME_TOP);
  // Gaps are positions AFTER item index i (insert between i and i+1).
  // Skip gaps that sit between two fixed-top sections; skip after final "more".
  const gapAfter: number[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const cur = items[i]!;
    const next = items[i + 1]!;
    if (cur.kind !== "section" || next.kind !== "section") continue;
    if (next.id === "more") {
      // Allow insert just before Explore more.
      gapAfter.push(i);
      continue;
    }
    if (fixed.has(cur.id) && fixed.has(next.id)) continue;
    gapAfter.push(i);
  }
  if (gapAfter.length === 0) return items;

  const rng = mulberry32(hashSeed(opts?.seed ?? "home-topics"));

  // Shuffle available gaps, pick unique ones for each topic.
  const gaps = [...gapAfter];
  for (let i = gaps.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [gaps[i], gaps[j]] = [gaps[j]!, gaps[i]!];
  }
  const chosen = gaps.slice(0, Math.min(n, gaps.length)).sort((a, b) => b - a);

  // Shuffle topic indices so which topic lands where also varies with the seed.
  const topicIndices = Array.from({ length: n }, (_, i) => i);
  for (let i = topicIndices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [topicIndices[i], topicIndices[j]] = [topicIndices[j]!, topicIndices[i]!];
  }

  // Insert from the bottom so earlier indices stay valid.
  for (let k = 0; k < chosen.length; k++) {
    const after = chosen[k]!;
    const topicIndex = topicIndices[k]!;
    items.splice(after + 1, 0, { kind: "topic", topicIndex });
  }

  return items;
}

/** Post ids already on Breaking (singles + every member of a group). */
export function idsInBreaking(
  items: Array<
    | { kind: "post"; post: { id: string } }
    | { kind: "group"; members: Array<{ id: string }> }
  >
): Set<string> {
  const ids = new Set<string>();
  for (const it of items) {
    if (it.kind === "post") ids.add(it.post.id);
    else for (const m of it.members) ids.add(m.id);
  }
  return ids;
}

/** Front Page never repeats a Breaking story. Breaking keeps the slot. */
export function excludeBreakingFromFrontPage<T extends { id: string }>(
  posts: T[],
  breakingIds: Iterable<string>
): T[] {
  const ban = new Set(
    [...breakingIds].map((id) => String(id || "").trim()).filter(Boolean)
  );
  if (ban.size === 0) return posts;
  return posts.filter((p) => !ban.has(p.id));
}
