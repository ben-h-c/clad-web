/**
 * Topic aggregation for the home-page dashboard. Articles are grouped by the
 * topics Grok tags them with; each group gets an aggregate letter grade
 * (mean GPA) and an average political-lean score.
 */
import type { CollectionEntry } from "astro:content";

const GPA: Record<string, number> = {
  "A+": 12, A: 11, "A-": 10, "B+": 9, B: 8, "B-": 7,
  "C+": 6, C: 5, "C-": 4, "D+": 3, D: 2, "D-": 1, F: 0,
};
const GPA_LIST = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];

export function gradeToGpa(g?: string): number | null {
  return g && g in GPA ? GPA[g] : null;
}
export function gpaToGrade(n: number): string {
  return GPA_LIST[Math.max(0, Math.min(12, Math.round(n)))];
}

const ENUM_TO_SCORE: Record<string, number> = {
  left: -80, "center-left": -40, center: 0, "center-right": 40, right: 80, none: 0,
};
export function leanScoreOf(data: CollectionEntry<"posts">["data"]): number | null {
  if (typeof data.leanScore === "number") return data.leanScore;
  return data.politicalLean ? (ENUM_TO_SCORE[data.politicalLean] ?? 0) : null;
}

export function topicSlug(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);
}

export interface TopicAgg {
  display: string;
  slug: string;
  count: number;
  avgGrade: string | null;
  avgLean: number | null;
  leanSpread: [number, number] | null;
  latest: number;
  posts: CollectionEntry<"posts">[];
}

export function aggregateTopics(posts: CollectionEntry<"posts">[]): TopicAgg[] {
  const map = new Map<string, { display: string; slug: string; posts: CollectionEntry<"posts">[] }>();
  for (const p of posts) {
    for (const t of p.data.topics ?? []) {
      const slug = topicSlug(t);
      if (!slug) continue;
      if (!map.has(slug)) map.set(slug, { display: t, slug, posts: [] });
      map.get(slug)!.posts.push(p);
    }
  }

  const out: TopicAgg[] = [];
  for (const g of map.values()) {
    const gpas = g.posts.map((p) => gradeToGpa(p.data.letterGrade)).filter((n): n is number => n != null);
    const leans = g.posts.map((p) => leanScoreOf(p.data)).filter((n): n is number => n != null);
    out.push({
      display: g.display,
      slug: g.slug,
      count: g.posts.length,
      avgGrade: gpas.length ? gpaToGrade(gpas.reduce((a, b) => a + b, 0) / gpas.length) : null,
      avgLean: leans.length ? Math.round(leans.reduce((a, b) => a + b, 0) / leans.length) : null,
      leanSpread: leans.length ? [Math.min(...leans), Math.max(...leans)] : null,
      latest: Math.max(...g.posts.map((p) => p.data.publishedAt.valueOf())),
      posts: g.posts,
    });
  }
  out.sort((a, b) => b.count - a.count || b.latest - a.latest);
  return out;
}
