/**
 * What is worth a lock-screen interruption?
 *
 * Apple HIG + industry practice for news/fact-check apps:
 * - Prefer rare, high-signal alerts over per-item spam
 * - Never use Time Sensitive for routine news (destroys trust)
 * - Cap daily volume; batch the rest into digests
 * - Respect quiet hours (local evening/night)
 *
 * CladFacts product rule: users open the app for grades on *what matters*,
 * not a push for every talk-show segment we grade.
 */

export type ReportPushTier = "skip" | "notable" | "highlight";

export type InterruptionLevel = "passive" | "active" | "time-sensitive";

export interface ReportPushMeta {
  headline: string;
  letterGrade?: string | null;
  factualityScore?: number | null;
  featured?: boolean;
  topics?: string[] | null;
  sourceTitle?: string | null;
  summary?: string | null;
}

/** Marquee civic moments — rare enough to interrupt. */
const HIGHLIGHT_RE =
  /\b(presidential debate|primary debate|vp debate|vice.?presidential debate|state of the union|inaugurat|election night|scotus|supreme court|impeach|assassination|hostage release|cease.?fire|nuclear|martial law)\b/i;

/** Secondary signals for a quiet-but-valuable “notable” ping. */
const NOTABLE_TOPIC_RE =
  /\b(debate|election|midterm|scotus|supreme court|white house|congress|senate|impeach|war|hostage|cease.?fire|fed |federal reserve|shutdown)\b/i;

/**
 * Classify a newly published report for push.
 * - highlight: rare lock-screen alert (active, with sound)
 * - notable: limited daily budget, active soft alert
 * - skip: no immediate push (eligible for evening desk digest only)
 */
export function classifyReportPush(meta: ReportPushMeta): ReportPushTier {
  const headline = String(meta.headline || "").trim();
  if (!headline) return "skip";

  const grade = String(meta.letterGrade || "").trim().toUpperCase();
  const topics = (meta.topics || []).map((t) => String(t)).join(" ");
  const blob = `${headline} ${topics} ${meta.summary || ""}`;

  if (meta.featured) return "highlight";
  if (grade === "A+" || grade === "F") return "highlight";
  if (HIGHLIGHT_RE.test(blob)) return "highlight";

  // Extreme grades on anything we bothered to publish
  if (/^A/.test(grade) || /^[DF]/.test(grade)) return "notable";
  if (
    typeof meta.factualityScore === "number" &&
    (meta.factualityScore >= 92 || meta.factualityScore <= 38)
  ) {
    return "notable";
  }
  // Civic-topic + non-middling grade
  if (NOTABLE_TOPIC_RE.test(blob) && grade && !/^B/.test(grade) && grade !== "C" && grade !== "C+") {
    return "notable";
  }

  return "skip";
}

export function reportPushCopy(
  tier: ReportPushTier,
  meta: ReportPushMeta
): { title: string; body: string; relevance: number; interruption: InterruptionLevel; sound: boolean } {
  const headline = String(meta.headline || "New report").slice(0, 120);
  const grade = meta.letterGrade ? ` · ${meta.letterGrade}` : "";

  if (tier === "highlight") {
    return {
      title: "Standout report card",
      body: `${headline}${grade}`.slice(0, 180),
      relevance: 0.9,
      interruption: "active",
      sound: true,
    };
  }
  // notable
  return {
    title: "Notable grade",
    body: `${headline}${grade}`.slice(0, 180),
    relevance: 0.55,
    interruption: "active",
    sound: false,
  };
}

/** NY-desk quiet hours: 22:00–06:59 America/New_York. */
export function isQuietHoursNy(now = new Date()): boolean {
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hour12: false,
      }).format(now)
    );
    return hour >= 22 || hour < 7;
  } catch {
    const h = now.getUTCHours();
    // Rough ET fallback
    return h >= 2 && h < 11;
  }
}

/** Civil date key in America/New_York (YYYY-MM-DD). */
export function pushDayKeyNy(now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Fleet-wide daily caps (all devices share one editorial budget). */
export const PUSH_DAILY_CAPS = {
  /** Max lock-screen report alerts per NY day (highlight + notable). */
  reportAlerts: 3,
  /** Max of those that may be "highlight" tier. */
  highlights: 2,
  /** Max calendar daybook pushes per NY day (0–1 intended). */
  calendar: 1,
} as const;

/**
 * Calendar events worth a morning ping. Routine daybook clutter stays in-app.
 */
export function isMarqueeCalendarTitle(title: string): boolean {
  return /\b(debate|primary|election|scotus|supreme court|state of the union|inaugurat|convention|caucus|hearing|vote|ruling|fed |fomc|jobs report|cpi|gdp)\b/i.test(
    String(title || "")
  );
}

export function calendarPushCopy(mode: "today" | "tomorrow", titles: string[]): {
  title: string;
  body: string;
  relevance: number;
  interruption: InterruptionLevel;
  sound: boolean;
} | null {
  const marquee = titles.filter(isMarqueeCalendarTitle);
  // Require at least one marquee item — otherwise don't ping the lock screen.
  if (marquee.length === 0) return null;

  const head = marquee[0]!;
  const more = marquee.length - 1;
  const when = mode === "today" ? "Today" : "Tomorrow";
  return {
    title: `Daybook · ${when}`,
    body: (more > 0 ? `${head} · +${more} more` : head).slice(0, 180),
    relevance: mode === "today" ? 0.5 : 0.35,
    // Morning today: soft active. Tomorrow preview: passive (NC only).
    interruption: mode === "today" ? "active" : "passive",
    sound: false,
  };
}

export function digestPushCopy(headlines: string[], count: number): {
  title: string;
  body: string;
  relevance: number;
  interruption: InterruptionLevel;
  sound: boolean;
} {
  const n = Math.max(count, headlines.length);
  const standout = headlines[0] || "new graded reports";
  return {
    title: n === 1 ? "Today on the desk" : `${n} new report cards`,
    body: (n === 1 ? standout : `${standout} · +${n - 1} more`).slice(0, 180),
    relevance: 0.4,
    interruption: "passive",
    sound: false,
  };
}
