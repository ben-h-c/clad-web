/**
 * Home spotlight promos — dismissible banners at the top of the landing page.
 *
 * Static entries live in HOME_PROMOS; call `homePromosForPage()` to merge in
 * live “hot topic / hot report” cards from the current corpus.
 * Each promo is keyed by `id` for per-view dismiss (hide until refresh).
 */

export type HomePromoVariant =
  | "default"
  | "midterms"
  | "urgent"
  | "campus"
  | "play"
  | "feature";

export interface HomePromo {
  /** Stable id — used for dismiss storage. Change id to re-show after an edit. */
  id: string;
  /** Eyebrow / kicker line */
  kicker: string;
  /** Short headline */
  title: string;
  /** One-line body */
  body: string;
  /** Primary CTA */
  href: string;
  cta: string;
  /** Optional secondary link */
  secondaryHref?: string;
  secondaryCta?: string;
  /** Visual treatment */
  variant?: HomePromoVariant;
  /** Higher first. Default 0. */
  priority?: number;
  /** Set false to park a promo without deleting it. Default true. */
  enabled?: boolean;
  /** Show starting this date (inclusive, YYYY-MM-DD or full ISO). */
  from?: string;
  /** Hide after this date (exclusive if date-only; inclusive end-of-day if time given). */
  until?: string;
}

/**
 * Evergreen feature spotlights — rotation of product surfaces that drive
 * engagement. Live “hot” cards are layered on in homePromosForPage().
 */
export const HOME_PROMOS: HomePromo[] = [
  {
    id: "midterms-2026-ballot",
    kicker: "Midterms 2026",
    title: "Fill your midterms ballot",
    body: "Pick winners race-by-race, lock in to share, and track your score as races are called.",
    href: "/bracket/",
    cta: "Ballot board",
    secondaryHref: "/elections/map/",
    secondaryCta: "Election map",
    variant: "midterms",
    priority: 100,
    enabled: true,
  },
  {
    id: "feature-morning-quiz",
    kicker: "Play",
    title: "Can you spot the spin?",
    body: "Five real claims from recent coverage. Call the verdict, then see how Clad graded the report.",
    href: "/quiz/",
    cta: "Morning quiz",
    secondaryHref: "/bias/",
    secondaryCta: "Check your bias",
    variant: "play",
    priority: 85,
    enabled: true,
  },
  {
    id: "feature-community-votes",
    kicker: "Community",
    title: "See how Clad readers locked their picks",
    body: "Anonymous tallies by race — no names, just the board. Lock your ballot to join the count.",
    href: "/bracket/votes/",
    cta: "Community votes",
    secondaryHref: "/bracket/",
    secondaryCta: "Your ballot",
    variant: "feature",
    priority: 75,
    enabled: true,
  },
  {
    id: "feature-free-account",
    kicker: "Free · no card",
    title: "Unlock every grade with a free account",
    body: "Letter grades, lean scores, charts, and search filters — full access the moment you sign up.",
    href: "/register/?next=/",
    cta: "Create free account",
    secondaryHref: "/how-it-works/",
    secondaryCta: "How it works",
    variant: "default",
    priority: 70,
    enabled: true,
  },
  {
    id: "feature-discover",
    kicker: "Read",
    title: "Discover solid coverage",
    body: "Curated stories worth your time — plus Good News when you need a lighter load.",
    href: "/discover/",
    cta: "Discover",
    secondaryHref: "/good-news/",
    secondaryCta: "Good News",
    variant: "campus",
    priority: 55,
    enabled: true,
  },
  {
    id: "feature-students",
    kicker: "Campus",
    title: "Built for students and first-time voters",
    body: "How to read grades, share them, and cut through spin — no jargon.",
    href: "/students/",
    cta: "Student hub",
    secondaryHref: "/learn/first-vote/",
    secondaryCta: "First-time voter",
    variant: "campus",
    priority: 45,
    enabled: true,
  },
];

function parseBound(iso: string, endOfDay: boolean): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    if (endOfDay) return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
    return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  }
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

function isActive(p: HomePromo, t: number): boolean {
  if (p.enabled === false) return false;
  if (p.from) {
    const from = parseBound(p.from, false);
    if (Number.isFinite(from) && t < from) return false;
  }
  if (p.until) {
    const until = parseBound(p.until, true);
    if (Number.isFinite(until) && t > until) return false;
  }
  return true;
}

/** Promos that should render right now (enabled + within date window), priority desc. */
export function activeHomePromos(now: Date = new Date()): HomePromo[] {
  const t = now.getTime();
  return HOME_PROMOS.filter((p) => isActive(p, t)).sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
  );
}

export interface HomePromoContext {
  now?: Date;
  /** When true, surface free-account unlock; when false, skip that promo. */
  locked?: boolean;
  /** Hottest topic today (from aggregateTopics). */
  hotTopic?: { display: string; slug: string; todayCount: number; recentCount: number } | null;
  /** Freshest high-signal report (featured or newest). */
  hotPost?: { id: string; headline: string; ageHours: number } | null;
  /** Max banners to show (default 3). */
  max?: number;
}

/**
 * Static feature promos + optional live hot-topic / hot-report cards.
 * Caps the list so the top of home stays scannable.
 */
export function homePromosForPage(ctx: HomePromoContext = {}): HomePromo[] {
  const now = ctx.now ?? new Date();
  const t = now.getTime();
  const max = ctx.max ?? 3;
  const list: HomePromo[] = [];

  // Live: super-hot topic (multiple pieces today, or heavy last 3 days)
  const ht = ctx.hotTopic;
  if (ht && (ht.todayCount >= 2 || ht.recentCount >= 4)) {
    list.push({
      id: `hot-topic-${ht.slug}`,
      kicker: ht.todayCount >= 2 ? "Hot today" : "Heating up",
      title: ht.display,
      body:
        ht.todayCount >= 2
          ? `${ht.todayCount} graded reports on this story in the last day — see how coverage is holding up.`
          : `${ht.recentCount} reports in the last few days. Grades and lean when you open the topic.`,
      href: `/topics/${ht.slug}/`,
      cta: "Open topic",
      secondaryHref: "/search/",
      secondaryCta: "Search all",
      variant: "urgent",
      priority: 115,
      enabled: true,
    });
  }

  // Live: brand-new report (under ~18h) worth a push
  const hp = ctx.hotPost;
  if (hp && hp.ageHours <= 18) {
    const when =
      hp.ageHours < 2 ? "Just published" : hp.ageHours < 8 ? "This morning" : "New report";
    list.push({
      id: `hot-post-${hp.id}`,
      kicker: when,
      title: hp.headline.length > 90 ? hp.headline.slice(0, 87) + "…" : hp.headline,
      body: "Fresh fact-check on the front of the desk — grade and lean unlock free with an account.",
      href: `/posts/${hp.id}/`,
      cta: "Read report",
      secondaryHref: "/recent/",
      secondaryCta: "Latest",
      variant: "urgent",
      priority: 112,
      enabled: true,
    });
  }

  for (const p of HOME_PROMOS) {
    if (!isActive(p, t)) continue;
    // Signed-in full-access readers don't need the free-account upsell
    if (p.id === "feature-free-account" && ctx.locked === false) continue;
    list.push(p);
  }

  // Deduplicate by id (static + dynamic shouldn't collide, but be safe)
  const seen = new Set<string>();
  const unique = list.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  return unique
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, max);
}
