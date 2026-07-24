/**
 * Daily “feature” slides for the home media-hero strip.
 * Merges the desk/agent highlight with today’s calendar + fresh graded reports
 * so the strip grows as the day produces more items.
 *
 * Topic-aware dedupe: one slide per story cluster (e.g. only one Starship card).
 */
import type { CollectionEntry } from "astro:content";
import type { CalendarEvent } from "./calendarEvents.ts";
import { todayIsoNy } from "./calendarEvents.ts";
import type { HomeLayoutHighlight } from "./homeLayout.ts";
import { displayableThumb } from "./imagePolicy.ts";

export interface HomeFeatureItem {
  id: string;
  kicker: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  secondaryHref?: string;
  secondaryCta?: string;
  variant?: string;
  image?: string | null;
}

const STOP = new Set([
  "today",
  "this",
  "that",
  "with",
  "from",
  "into",
  "about",
  "after",
  "before",
  "during",
  "while",
  "where",
  "which",
  "their",
  "there",
  "these",
  "those",
  "would",
  "could",
  "should",
  "being",
  "been",
  "have",
  "will",
  "were",
  "what",
  "when",
  "your",
  "more",
  "most",
  "than",
  "them",
  "then",
  "also",
  "just",
  "only",
  "over",
  "such",
  "same",
  "some",
  "other",
  "between",
  "through",
  "under",
  "again",
  "still",
  "report",
  "reports",
  "graded",
  "coverage",
  "breaking",
  "update",
  "updates",
  "news",
  "says",
  "said",
  "targets",
  "target",
  "evening",
  "morning",
  "minutes",
  "window",
  "opens",
  "second",
  "attempt",
  "first",
]);

/** Named story clusters that should never appear twice in the strip. */
const CLUSTER_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "spacex-starship", re: /\b(spacex|starship|starbase|super\s*heavy|flight\s*1[0-9])\b/i },
  { id: "iran-conflict", re: /\b(iran|tehran|hormuz|strait of hormuz)\b/i },
  { id: "midterms-2026", re: /\b(midterm|ballot board|election map)\b/i },
  { id: "fed-rates", re: /\b(federal reserve|fomc|interest rate|jerome powell)\b/i },
  { id: "tariffs-trade", re: /\b(tariff|mag\s*7|trade war)\b/i },
];

function clip(s: string, n: number): string {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).trimEnd() + "…";
}

function kindKicker(kind: string): string {
  switch (kind) {
    case "launch":
      return "Today · Launch";
    case "election":
    case "primary":
    case "runoff":
    case "special":
    case "general":
      return "Today · Election";
    case "conflict":
      return "Today · Conflict";
    case "markets":
      return "Today · Markets";
    case "court":
      return "Today · Courts";
    case "science":
      return "Today · Science";
    case "speech":
      return "Today · Speech";
    case "politics":
      return "Today · Politics";
    case "disaster":
      return "Today · Alert";
    default:
      return "Today · Daybook";
  }
}

function variantForKind(kind: string): string {
  if (kind === "conflict" || kind === "disaster") return "urgent";
  if (kind === "election" || kind === "primary" || kind === "general") return "midterms";
  if (kind === "launch" || kind === "science") return "event";
  return "default";
}

function contentBlob(title: string, body = ""): string {
  return `${title} ${body}`.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Significant tokens + named clusters for topic dedupe. */
function topicSignature(title: string, body = ""): { clusters: string[]; tokens: Set<string> } {
  const blob = contentBlob(title, body);
  const clusters: string[] = [];
  for (const c of CLUSTER_PATTERNS) {
    if (c.re.test(blob)) clusters.push(c.id);
  }
  const tokens = new Set(
    blob
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w))
      .slice(0, 14)
  );
  return { clusters, tokens };
}

function sharesTopic(
  a: { clusters: string[]; tokens: Set<string> },
  b: { clusters: string[]; tokens: Set<string> }
): boolean {
  if (a.clusters.some((c) => b.clusters.includes(c))) return true;
  if (a.tokens.size === 0 || b.tokens.size === 0) return false;
  let shared = 0;
  for (const t of a.tokens) if (b.tokens.has(t)) shared++;
  // 2+ meaningful shared tokens, or high overlap on short titles
  if (shared >= 2) return true;
  const smaller = Math.min(a.tokens.size, b.tokens.size);
  if (smaller >= 3 && shared / smaller >= 0.5) return true;
  return false;
}

/** Prefer post stills whose headline/summary share words with the event title. */
function imageForEvent(
  title: string,
  posts: CollectionEntry<"posts">[]
): string | null {
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .slice(0, 8);
  if (words.length === 0) return null;
  for (const p of posts) {
    const blob = `${p.data.headline} ${p.data.summary ?? ""}`.toLowerCase();
    const hits = words.filter((w) => blob.includes(w)).length;
    if (hits >= 2) {
      const t = displayableThumb(p.data.thumbnail);
      if (t) return t;
    }
  }
  return null;
}

/**
 * Build ordered feature slides for the home strip.
 * @param max total slides (desk highlight counts toward the cap)
 */
export function buildHomeFeatureItems(opts: {
  highlight?: HomeLayoutHighlight | null;
  calendarEvents?: CalendarEvent[] | null;
  posts: CollectionEntry<"posts">[];
  now?: Date;
  max?: number;
}): HomeFeatureItem[] {
  const now = opts.now ?? new Date();
  const today = todayIsoNy(now);
  const max = Math.max(3, Math.min(12, opts.max ?? 8));
  const posts = opts.posts;
  const out: HomeFeatureItem[] = [];
  const seenHref = new Set<string>();
  const seenId = new Set<string>();
  const sigs: { clusters: string[]; tokens: Set<string> }[] = [];

  const push = (item: HomeFeatureItem) => {
    if (out.length >= max) return false;
    const href = item.href.split("?")[0];
    if (seenHref.has(href) || seenId.has(item.id)) return false;

    const sig = topicSignature(item.title, item.body);
    // Also fold secondary/day links into identity when they point at the same story post
    for (const existing of sigs) {
      if (sharesTopic(sig, existing)) return false;
    }

    seenHref.add(href);
    seenId.add(item.id);
    // Block the post path if secondary is a post (desk highlight often links both)
    if (item.secondaryHref?.startsWith("/posts/")) {
      seenHref.add(item.secondaryHref.split("?")[0]!);
    }
    sigs.push(sig);
    out.push(item);
    return true;
  };

  // 1) Desk / agent highlight (pinned)
  const h = opts.highlight;
  if (h) {
    let image = h.image ? displayableThumb(h.image) : null;
    if (!image && h.href.startsWith("/posts/")) {
      const slug = h.href.replace(/^\/posts\//, "").replace(/\/$/, "").split("?")[0];
      const post = posts.find((p) => p.id === slug);
      image = displayableThumb(post?.data.thumbnail) ?? null;
    }
    push({
      id: h.id,
      kicker: h.kicker,
      title: h.title,
      body: h.body,
      href: h.href,
      cta: h.cta,
      secondaryHref: h.secondaryHref,
      secondaryCta: h.secondaryCta,
      variant: h.variant || "event",
      image,
    });
  }

  // 2) Today’s daybook (calendar agent + races)
  const todayEvents = (opts.calendarEvents ?? [])
    .filter((e) => e.date === today)
    .sort((a, b) => {
      const rank = (k: string) =>
        k === "launch" ? 0 : k === "conflict" ? 1 : k === "election" || k === "politics" ? 2 : 3;
      return rank(a.kind) - rank(b.kind) || a.title.localeCompare(b.title);
    });

  for (const e of todayEvents) {
    const link = e.links?.find((l) => l.href.startsWith("/"))?.href;
    // Prefer a deep link over the day hub so we don't fill the strip with /day/YYYY
    const href = link || `/day/${today}/`;
    // Skip bare day links when we already have several items (low signal)
    if (!link && out.length >= 4) continue;
    const image = imageForEvent(e.title, posts);
    push({
      id: `cal-${e.id}`,
      kicker: kindKicker(e.kind),
      title: clip(e.title, 110),
      body: clip(e.body || `On the CladFacts daybook for ${today}.`, 180),
      href,
      cta: link ? "Open" : "Today’s calendar",
      secondaryHref: link ? `/day/${today}/` : undefined,
      secondaryCta: link ? "Full day" : undefined,
      variant: variantForKind(e.kind),
      image,
    });
  }

  // 3) Fresh graded reports from the last ~36 hours with stills
  const since = now.getTime() - 36 * 3_600_000;
  const fresh = posts
    .filter(
      (p) =>
        p.data.publishedAt.valueOf() >= since &&
        displayableThumb(p.data.thumbnail) &&
        p.data.letterGrade
    )
    .slice(0, 24);

  for (const p of fresh) {
    const image = displayableThumb(p.data.thumbnail);
    push({
      id: `post-${p.id}`,
      kicker: p.data.sourceTitle
        ? `Today · ${clip(p.data.sourceTitle, 28)}`
        : "Today · Graded",
      title: clip(p.data.headline, 110),
      body: clip(p.data.summary || "Fresh fact-check on the Clad desk.", 180),
      href: `/posts/${p.id}/`,
      cta: "Read report",
      secondaryHref: `/day/${today}/`,
      secondaryCta: "Today’s calendar",
      variant: "topic",
      image,
    });
  }

  // 4) Fallback: newest posts with images if the day is still thin
  if (out.length < 3) {
    for (const p of posts.slice(0, 24)) {
      const image = displayableThumb(p.data.thumbnail);
      if (!image) continue;
      push({
        id: `post-${p.id}`,
        kicker: "On the desk",
        title: clip(p.data.headline, 110),
        body: clip(p.data.summary || "", 180),
        href: `/posts/${p.id}/`,
        cta: "Read report",
        variant: "default",
        image,
      });
      if (out.length >= Math.min(5, max)) break;
    }
  }

  return out;
}
