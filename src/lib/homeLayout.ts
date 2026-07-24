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
  | "election-map"
  | "grades"
  | "today-history"
  | "human-spotlight"
  | "discover"
  | "good-news"
  | "quips"
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
}

export interface HomeLayoutStore {
  generatedAt: string;
  /** ISO — after this, homepage ignores the agent layout. */
  expiresAt: string;
  /** Short desk note: why this layout (debug / admin). */
  reason: string;
  /** Preferred section order (partial OK; gaps filled from default). */
  order?: HomeSectionId[];
  /** Sections to hide for this cycle (cannot hide core: breaking, front-page). */
  hide?: HomeSectionId[];
  /** Optional full-width feature / current-events strip. */
  highlight?: HomeLayoutHighlight | null;
  /** Search queries the agent used (audit trail). */
  sourceQueries?: string[];
}

/** Default top-to-bottom home stack. */
export const DEFAULT_HOME_ORDER: HomeSectionId[] = [
  "guest-hero",
  "feature-highlight",
  "spotlight",
  "app-promo",
  "breaking",
  "front-page",
  "lean",
  "calendar",
  "topics",
  "election-map",
  "grades",
  "today-history",
  "human-spotlight",
  "discover",
  "good-news",
  "quips",
  "more",
];

/** Never hide these — core news + always-on midterms map teaser. */
const PROTECTED = new Set<HomeSectionId>(["breaking", "front-page", "election-map"]);

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
 */
export function resolveHomeOrder(
  store: HomeLayoutStore | null | undefined,
  now = new Date()
): HomeSectionId[] {
  const fresh = isHomeLayoutFresh(store, now) ? store : null;
  const hide = new Set(fresh?.hide || []);
  for (const p of PROTECTED) hide.delete(p);

  const preferred = (fresh?.order || []).filter(isHomeSectionId);
  const seen = new Set<HomeSectionId>();
  const out: HomeSectionId[] = [];

  for (const id of preferred) {
    if (seen.has(id) || hide.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of DEFAULT_HOME_ORDER) {
    if (seen.has(id) || hide.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
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
