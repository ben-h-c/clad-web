/**
 * Per-day calendar summaries — the graded record, one row per publish day.
 *
 * The home calendar used to receive only a handful of individual reports
 * (3/day, 72 total), so a cell could show a dot and nothing else. This builds
 * a compact aggregate per day instead: how many reports ran, how they graded
 * on average, and how the day's coverage split by lean — which is what makes
 * the calendar readable as a record rather than a list of links.
 *
 * GATING: letter grade, GPA and lean are Premium-gated values (same rule as
 * every other surface — see lib/access). When `locked` is true this module
 * emits `null` for all three and strips per-report grades, so nothing gated
 * can reach anonymous HTML even though the payload is inlined in the page.
 * Report counts, headlines and outlet names are public content and stay.
 *
 * Imports are relative with explicit .ts extensions: the agent runner loads
 * src/lib under plain Node, which does no alias or extensionless resolution.
 */
import { todayIsoNy } from "./calendarEvents.ts";
import { gradeToGpa, gpaToGrade, leanScoreOf } from "./topics.ts";
import { LEAN_THRESHOLD } from "./trends.ts";

/** One report surfaced in a day's peek list. Grade is null when locked. */
export interface CalendarDayReport {
  slug: string;
  title: string;
  outlet: string;
  grade: string | null;
}

export interface CalendarDaySummary {
  /** Civil day in the NY desk timezone, YYYY-MM-DD. */
  date: string;
  /** Total reports published that day (public). */
  n: number;
  /** Average letter grade for the day — null when locked or ungraded. */
  grade: string | null;
  /**
   * Mean grade band on the 0–12 scale used by gradeToGpa (F=0 … A+=12).
   * Drives the colour wash — null when locked.
   */
  gpa: number | null;
  /** Coverage split [left, center, right] as percentages — null when locked. */
  lean: [number, number, number] | null;
  /**
   * Mean political-lean score −100..+100 for the article-style spectrum bar.
   * Null when locked or no scored reports that day.
   */
  avgLean: number | null;
  /** A few headlines for the day peek. */
  top: CalendarDayReport[];
}

export interface CalendarDayIndex {
  days: CalendarDaySummary[];
  /** Earliest day carrying reports (YYYY-MM-DD) — bounds the month nav. */
  first: string | null;
  /** Latest day carrying reports. */
  last: string | null;
}

type PostLike = {
  id: string;
  data: {
    headline: string;
    publishedAt: Date;
    sourceTitle?: string;
    letterGrade?: string;
    [k: string]: unknown;
  };
};

/**
 * Bucket every published report by its NY publish day and summarise each day.
 * Unlike eventsFromPosts this has no per-day or total cap — the whole archive
 * is summarised, because an aggregate costs a few bytes per day rather than
 * per report.
 */
export function buildDaySummaries(
  posts: PostLike[],
  opts: { locked: boolean; topPerDay?: number }
): CalendarDayIndex {
  const topPerDay = opts.topPerDay ?? 5;
  const locked = opts.locked;

  const buckets = new Map<string, PostLike[]>();
  for (const p of posts) {
    if (!(p.data.publishedAt instanceof Date)) continue;
    const date = todayIsoNy(p.data.publishedAt);
    const list = buckets.get(date);
    if (list) list.push(p);
    else buckets.set(date, [p]);
  }

  const days: CalendarDaySummary[] = [];
  for (const [date, list] of buckets) {
    // Newest first within the day so the peek shows the day's latest coverage.
    const sorted = [...list].sort(
      (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf()
    );

    let grade: string | null = null;
    let gpa: number | null = null;
    let lean: [number, number, number] | null = null;
    let avgLean: number | null = null;

    if (!locked) {
      const gpas = sorted
        .map((p) => gradeToGpa(p.data.letterGrade))
        .filter((n): n is number => n != null);
      if (gpas.length) {
        gpa = gpas.reduce((a, b) => a + b, 0) / gpas.length;
        grade = gpaToGrade(gpa);
      }

      const leans = sorted
        .map((p) => leanScoreOf(p.data as never))
        .filter((n): n is number => n != null);
      if (leans.length) {
        let l = 0;
        let c = 0;
        let r = 0;
        for (const s of leans) {
          if (s <= -LEAN_THRESHOLD) l++;
          else if (s >= LEAN_THRESHOLD) r++;
          else c++;
        }
        // Percentages that always total 100 — the ribbon is drawn from these.
        const pl = Math.round((l / leans.length) * 100);
        const pc = Math.round((c / leans.length) * 100);
        lean = [pl, pc, Math.max(0, 100 - pl - pc)];
        avgLean = Math.round(leans.reduce((a, b) => a + b, 0) / leans.length);
      }
    }

    days.push({
      date,
      n: sorted.length,
      grade,
      gpa,
      lean,
      avgLean,
      top: sorted.slice(0, topPerDay).map((p) => ({
        slug: p.id,
        title: String(p.data.headline || "").slice(0, 140),
        outlet: String(p.data.sourceTitle || "").slice(0, 60),
        grade: locked ? null : (p.data.letterGrade ?? null),
      })),
    });
  }

  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    days,
    first: days.length ? days[0].date : null,
    last: days.length ? days[days.length - 1].date : null,
  };
}

/** Reports for a single civil day, newest first. */
export function postsForDay<T extends PostLike>(posts: T[], date: string): T[] {
  return posts
    .filter((p) => p.data.publishedAt instanceof Date && todayIsoNy(p.data.publishedAt) === date)
    .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
}

/** Neighbouring days that actually carry reports, for prev/next links. */
export function adjacentDays(dates: string[], date: string): { prev: string | null; next: string | null } {
  const sorted = [...new Set(dates)].sort();
  let prev: string | null = null;
  let next: string | null = null;
  for (const d of sorted) {
    if (d < date) prev = d;
    else if (d > date) {
      next = d;
      break;
    }
  }
  return { prev, next };
}

/** Shift a YYYY-MM-DD civil date by whole days without timezone drift. */
export function shiftIsoDate(date: string, deltaDays: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays);
  return new Date(t).toISOString().slice(0, 10);
}

/** Pretty long-form label for a civil date, e.g. "Monday, July 20, 2026". */
export function labelDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
