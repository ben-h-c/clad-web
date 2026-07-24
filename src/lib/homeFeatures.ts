/**
 * Daily “feature” slides for the home media-hero strip.
 * Merges the desk/agent highlight with today’s calendar + fresh graded reports
 * so the strip grows as the day produces more items.
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

/** Prefer post stills whose headline/summary share words with the event title. */
function imageForEvent(
  title: string,
  posts: CollectionEntry<"posts">[]
): string | null {
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4)
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

  const push = (item: HomeFeatureItem) => {
    if (out.length >= max) return;
    const href = item.href.split("?")[0];
    if (seenHref.has(href) || seenId.has(item.id)) return;
    seenHref.add(href);
    seenId.add(item.id);
    out.push(item);
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
      // Prefer launches / politics / conflict first
      const rank = (k: string) =>
        k === "launch" ? 0 : k === "conflict" ? 1 : k === "election" || k === "politics" ? 2 : 3;
      return rank(a.kind) - rank(b.kind) || a.title.localeCompare(b.title);
    });

  for (const e of todayEvents) {
    const link = e.links?.find((l) => l.href.startsWith("/"))?.href;
    const href = link || `/day/${today}/`;
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
    .slice(0, 16);

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
    for (const p of posts.slice(0, 20)) {
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
