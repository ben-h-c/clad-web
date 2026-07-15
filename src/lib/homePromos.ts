/**
 * Home spotlight promos — dismissible banners at the top of the landing page.
 *
 * Add/edit entries here to highlight midterms, campus pushes, big nights, etc.
 * Each promo is keyed by `id` for localStorage dismiss (`clad_promo_<id>`).
 * Optional `from` / `until` (ISO date strings) gate visibility by calendar day.
 */

export type HomePromoVariant = "default" | "midterms" | "urgent" | "campus";

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
 * Configure landing-page spotlights here.
 * Order is overridden by `priority` (higher first).
 */
export const HOME_PROMOS: HomePromo[] = [
  {
    id: "midterms-2026",
    kicker: "Midterms 2026",
    title: "Coverage heat for the races that matter",
    body: "Class II Senate, governors, and an interactive map — graded coverage, not polls.",
    href: "/elections/map/",
    cta: "Election map",
    secondaryHref: "/bracket/",
    secondaryCta: "Race board",
    variant: "midterms",
    priority: 100,
    enabled: true,
    // until: "2026-11-05", // Election Day — un-comment to auto-expire
  },
  // Example of a parked / future promo (disabled):
  // {
  //   id: "students-fall",
  //   kicker: "Campus",
  //   title: "Clad for students",
  //   body: "Grades, explainers, and a free account for class.",
  //   href: "/students/",
  //   cta: "Student hub",
  //   variant: "campus",
  //   priority: 40,
  //   enabled: false,
  // },
];

function parseBound(iso: string, endOfDay: boolean): number {
  // Date-only YYYY-MM-DD → treat as local midnight (start) or end-of-day (until)
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    if (endOfDay) return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
    return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  }
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/** Promos that should render right now (enabled + within date window), priority desc. */
export function activeHomePromos(now: Date = new Date()): HomePromo[] {
  const t = now.getTime();
  return HOME_PROMOS.filter((p) => {
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
  }).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}
