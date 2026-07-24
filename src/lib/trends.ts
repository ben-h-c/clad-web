/**
 * Week-over-week news trends. Buckets published posts into ISO weeks (Monday
 * start, UTC) and derives, per week: coverage volume, net political lean and a
 * left/center/right split, average grade, dominant themes, and a few key
 * headlines. Flags weeks that were unusually heavy or politically skewed so the
 * Trends page can call them out.
 */
import type { CollectionEntry } from "astro:content";
import type { SentimentMap } from "./agents.ts";
import { canonicalTopic, gradeToGpa, gpaToGrade, leanScoreOf } from "./topics.ts";

export interface WeekHeadline {
  slug: string;
  headline: string;
  grade: string | null;
  lean: number | null;
}

export interface WeekStat {
  start: number; // ms, Monday 00:00 UTC
  label: string; // e.g. "Jun 9–15"
  count: number;
  avgLean: number | null;
  leanDir: "left" | "right" | "center" | null;
  left: number;
  center: number;
  right: number;
  avgGpa: number | null;
  avgGrade: string | null;
  // Average social-media sentiment of the week's scanned posts (null when
  // none were scanned or the caller didn't pass the sentiment map).
  avgSentiment: number | null;
  good: number; // A/B grades
  mid: number; // C grades
  poor: number; // D/F grades
  themes: { topic: string; count: number }[];
  headlines: WeekHeadline[];
  heavy: boolean;
  skewed: boolean;
}

export interface TopicTrend {
  topic: string;
  weekly: number[]; // count per week, aligned to weeks[]
  total: number;
  last: number;
  prev: number;
  dir: "up" | "down" | "flat";
}

export interface NetworkStat {
  name: string;
  count: number;
  avgGpa: number | null;
  avgGrade: string | null;
  avgLean: number | null;
  avgSentiment: number | null;
  weekly: number[];
  last: number;
  prev: number;
  dir: "up" | "down" | "flat";
}

export interface TrendsReport {
  weeks: WeekStat[]; // chronological, gap-filled
  callouts: WeekStat[]; // notable weeks, most recent first
  topics: TopicTrend[]; // top themes by volume, with weekly timeline
  networks: NetworkStat[]; // outlet leaderboard
  maxCount: number;
  totalPosts: number;
  weekSpan: number;
  busiest: WeekStat | null;
}

const WEEK_MS = 7 * 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const LEAN_THRESHOLD = 8; // |lean| below this counts as center
const SKEW_THRESHOLD = 25; // |avg lean| at/above this flags a skewed week

export function weekStartUTC(d: Date): number {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay(); // 0 Sun … 6 Sat
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return dt.getTime();
}

export function labelWeek(startMs: number): string {
  const a = new Date(startMs);
  const b = new Date(startMs + 6 * 86_400_000);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  return sameMonth
    ? `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}–${b.getUTCDate()}`
    : `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}–${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

let _trendsCache: {
  key: string;
  val: TrendsReport;
} | null = null;

/** Memoized when sentiments is empty (locked/anon paths). */
export function buildTrendsCached(posts: CollectionEntry<"posts">[]): TrendsReport {
  const key = `n=${posts.length}`;
  if (_trendsCache && _trendsCache.key === key) return _trendsCache.val;
  const val = buildTrends(posts, {});
  _trendsCache = { key, val };
  return val;
}

export function buildTrends(
  posts: CollectionEntry<"posts">[],
  sentiments: SentimentMap = {}
): TrendsReport {
  const live = posts.filter((p) => !p.data.draft);
  if (live.length === 0) {
    return { weeks: [], callouts: [], topics: [], networks: [], maxCount: 0, totalPosts: 0, weekSpan: 0, busiest: null };
  }

  const byWeek = new Map<number, CollectionEntry<"posts">[]>();
  for (const p of live) {
    const k = weekStartUTC(p.data.publishedAt);
    if (!byWeek.has(k)) byWeek.set(k, []);
    byWeek.get(k)!.push(p);
  }

  const starts = [...byWeek.keys()].sort((a, b) => a - b);
  const first = starts[0]!;
  const last = starts[starts.length - 1]!;

  const weeks: WeekStat[] = [];
  for (let t = first; t <= last; t += WEEK_MS) {
    const group = byWeek.get(t) ?? [];
    const leans = group.map((p) => leanScoreOf(p.data)).filter((n): n is number => n != null);
    const gpas = group.map((p) => gradeToGpa(p.data.letterGrade)).filter((n): n is number => n != null);
    const sentis = group
      .map((p) => sentiments[p.id]?.score)
      .filter((n): n is number => typeof n === "number");
    const avgLean = leans.length ? Math.round(leans.reduce((a, b) => a + b, 0) / leans.length) : null;
    const avgGpa = gpas.length ? gpas.reduce((a, b) => a + b, 0) / gpas.length : null;
    const avgSentiment = sentis.length
      ? Math.round(sentis.reduce((a, b) => a + b, 0) / sentis.length)
      : null;

    let left = 0,
      center = 0,
      right = 0;
    for (const l of leans) {
      if (l <= -LEAN_THRESHOLD) left++;
      else if (l >= LEAN_THRESHOLD) right++;
      else center++;
    }

    // Grade bands: A/B (gpa ≥ 7), C (4–6), D/F (≤ 3).
    let good = 0,
      mid = 0,
      poor = 0;
    for (const g of gpas) {
      if (g >= 7) good++;
      else if (g >= 4) mid++;
      else poor++;
    }

    // Dominant themes (canonical topic of each tagged topic).
    const themeCount = new Map<string, number>();
    for (const p of group) {
      const seen = new Set<string>();
      for (const raw of p.data.topics ?? []) {
        const c = canonicalTopic(raw);
        if (!c || seen.has(c)) continue;
        seen.add(c);
        themeCount.set(c, (themeCount.get(c) ?? 0) + 1);
      }
    }
    const themes = [...themeCount.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
      .slice(0, 3);

    // Key headlines: newest-first, one per distinct primary theme, up to 3.
    const newest = [...group].sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
    const headlines: WeekHeadline[] = [];
    const usedThemes = new Set<string>();
    for (const p of newest) {
      const primary = canonicalTopic(p.data.topics?.[0] ?? "") || p.id;
      if (usedThemes.has(primary)) continue;
      usedThemes.add(primary);
      headlines.push({
        slug: p.id,
        headline: p.data.headline,
        grade: p.data.letterGrade ?? null,
        lean: leanScoreOf(p.data),
      });
      if (headlines.length >= 3) break;
    }

    weeks.push({
      start: t,
      label: labelWeek(t),
      count: group.length,
      avgLean,
      leanDir:
        avgLean == null
          ? null
          : avgLean <= -LEAN_THRESHOLD
            ? "left"
            : avgLean >= LEAN_THRESHOLD
              ? "right"
              : "center",
      left,
      center,
      right,
      avgGpa,
      avgGrade: avgGpa == null ? null : gpaToGrade(avgGpa),
      avgSentiment,
      good,
      mid,
      poor,
      themes,
      headlines,
      heavy: false,
      skewed: false,
    });
  }

  // Thresholds derived from the dataset.
  const counts = weeks.map((w) => w.count).sort((a, b) => a - b);
  const median = quantile(counts, 0.5);
  const p75 = quantile(counts, 0.75);
  const heavyCut = Math.max(3, Math.max(p75, median * 1.5));

  for (const w of weeks) {
    w.heavy = w.count >= heavyCut && w.count > median;
    w.skewed = w.avgLean != null && Math.abs(w.avgLean) >= SKEW_THRESHOLD && w.count >= 3;
  }

  const maxCount = Math.max(...weeks.map((w) => w.count), 1);
  const callouts = weeks
    .filter((w) => w.heavy || w.skewed)
    .sort((a, b) => b.start - a.start);
  const busiest = weeks.reduce<WeekStat | null>(
    (best, w) => (best == null || w.count > best.count ? w : best),
    null
  );

  const W = weeks.length;
  const dirOf = (last: number, prev: number): "up" | "down" | "flat" =>
    last > prev ? "up" : last < prev ? "down" : "flat";

  // Topic momentum — each post's PRIMARY canonical theme, counted per week.
  const topicWeekly = new Map<string, number[]>();
  // Network leaderboard — by source outlet.
  const netAgg = new Map<
    string,
    { count: number; gpas: number[]; leans: number[]; sentis: number[]; weekly: number[] }
  >();

  weeks.forEach((w, wi) => {
    for (const p of byWeek.get(w.start) ?? []) {
      const theme = canonicalTopic(p.data.topics?.[0] ?? "");
      if (theme) {
        if (!topicWeekly.has(theme)) topicWeekly.set(theme, new Array(W).fill(0));
        topicWeekly.get(theme)![wi]++;
      }
      const name = (p.data.sourceTitle ?? "").trim() || "Unknown";
      if (!netAgg.has(name)) netAgg.set(name, { count: 0, gpas: [], leans: [], sentis: [], weekly: new Array(W).fill(0) });
      const n = netAgg.get(name)!;
      n.count++;
      n.weekly[wi]++;
      const g = gradeToGpa(p.data.letterGrade);
      if (g != null) n.gpas.push(g);
      const l = leanScoreOf(p.data);
      if (l != null) n.leans.push(l);
      const s = sentiments[p.id]?.score;
      if (typeof s === "number") n.sentis.push(s);
    }
  });

  const topics: TopicTrend[] = [...topicWeekly.entries()]
    .map(([topic, weekly]) => {
      const total = weekly.reduce((a, b) => a + b, 0);
      const last = weekly[W - 1] ?? 0;
      const prev = W >= 2 ? (weekly[W - 2] ?? 0) : 0;
      return { topic, weekly, total, last, prev, dir: dirOf(last, prev) };
    })
    .sort((a, b) => b.total - a.total || a.topic.localeCompare(b.topic))
    .slice(0, 8);

  const networks: NetworkStat[] = [...netAgg.entries()]
    .map(([name, n]) => {
      const avgGpa = n.gpas.length ? n.gpas.reduce((a, b) => a + b, 0) / n.gpas.length : null;
      const last = n.weekly[W - 1] ?? 0;
      const prev = W >= 2 ? (n.weekly[W - 2] ?? 0) : 0;
      return {
        name,
        count: n.count,
        avgGpa,
        avgGrade: avgGpa == null ? null : gpaToGrade(avgGpa),
        avgLean: n.leans.length ? Math.round(n.leans.reduce((a, b) => a + b, 0) / n.leans.length) : null,
        avgSentiment: n.sentis.length
          ? Math.round(n.sentis.reduce((a, b) => a + b, 0) / n.sentis.length)
          : null,
        weekly: n.weekly,
        last,
        prev,
        dir: dirOf(last, prev),
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 12);

  return {
    weeks,
    callouts,
    topics,
    networks,
    maxCount,
    totalPosts: live.length,
    weekSpan: weeks.length,
    busiest,
  };
}

/** Bar/cell color for a week's net lean (blue = left, red = right, grey = center). */
export function leanColor(avg: number | null): string {
  if (avg == null) return "rgba(150,150,150,0.35)";
  const mag = Math.min(100, Math.abs(avg));
  const alpha = (0.35 + 0.6 * (mag / 100)).toFixed(2);
  if (avg <= -LEAN_THRESHOLD) return `rgba(59,110,165,${alpha})`;
  if (avg >= LEAN_THRESHOLD) return `rgba(178,59,46,${alpha})`;
  return `rgba(140,140,140,${alpha})`;
}

export function leanLabel(avg: number | null): string {
  if (avg == null) return "No lean data";
  if (avg <= -LEAN_THRESHOLD) return `${Math.abs(avg)}% Left`;
  if (avg >= LEAN_THRESHOLD) return `${avg}% Right`;
  return "Balanced";
}

// |sentiment| below this reads as a mixed/divided reaction (matches the
// "Mixed" cutoff in SocialSentiment.astro).
export const SENTIMENT_THRESHOLD = 10;

/** Dot/cell color for social reception (green = positive, red = negative). */
export function sentimentColor(avg: number | null): string {
  if (avg == null) return "rgba(150,150,150,0.35)";
  const mag = Math.min(100, Math.abs(avg));
  const alpha = (0.35 + 0.6 * (mag / 100)).toFixed(2);
  if (avg >= SENTIMENT_THRESHOLD) return `rgba(46,125,79,${alpha})`;
  if (avg <= -SENTIMENT_THRESHOLD) return `rgba(178,59,46,${alpha})`;
  return `rgba(140,140,140,${alpha})`;
}

export function sentimentLabel(avg: number | null): string {
  if (avg == null) return "No reception data";
  if (avg >= SENTIMENT_THRESHOLD) return `${avg}% Positive`;
  if (avg <= -SENTIMENT_THRESHOLD) return `${Math.abs(avg)}% Negative`;
  return "Mixed";
}
