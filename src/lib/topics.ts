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
  thumbnail: string | null;
  posts: CollectionEntry<"posts">[];
}

const TOPIC_STOP = new Set(
  "the a an of and or to in on for at by with news update updates the".split(" ")
);
function topicTokens(t: string): Set<string> {
  return new Set(
    t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 2 && !TOPIC_STOP.has(w))
  );
}
// Similarity: 1 if one token set fully contains the other (e.g. "ufc" ⊂
// "white house ufc"), else Jaccard overlap.
function topicSim(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if ([...small].every((x) => big.has(x))) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function aggregateTopics(posts: CollectionEntry<"posts">[]): TopicAgg[] {
  // 1) group articles by exact topic string
  const byTopic = new Map<string, CollectionEntry<"posts">[]>();
  for (const p of posts) {
    for (const t of p.data.topics ?? []) {
      const key = t.trim();
      if (!key) continue;
      if (!byTopic.has(key)) byTopic.set(key, []);
      byTopic.get(key)!.push(p);
    }
  }

  // 2) cluster similar topic strings into a canonical tag. Process by article
  //    count desc so the most-covered phrasing becomes the canonical label and
  //    variant phrasings attach to it.
  const distinct = [...byTopic.keys()].sort(
    (a, b) => byTopic.get(b)!.length - byTopic.get(a)!.length || a.length - b.length
  );
  const anchors: { topic: string; tokens: Set<string> }[] = [];
  const canonOf = new Map<string, string>();
  for (const t of distinct) {
    const tt = topicTokens(t);
    let best: { topic: string; tokens: Set<string> } | null = null;
    let bestSim = 0;
    for (const a of anchors) {
      const s = topicSim(tt, a.tokens);
      if (s > bestSim) { bestSim = s; best = a; }
    }
    if (best && bestSim >= 0.5) canonOf.set(t, best.topic);
    else { anchors.push({ topic: t, tokens: tt }); canonOf.set(t, t); }
  }

  // 3) assign each article to ONE tile — its PRIMARY topic (the first tag,
  //    mapped to its canonical cluster) — so no article appears in multiple
  //    groups.
  const map = new Map<string, { display: string; slug: string; posts: CollectionEntry<"posts">[] }>();
  for (const p of posts) {
    const primary = (p.data.topics?.[0] ?? "").trim();
    if (!primary) continue;
    const canon = canonOf.get(primary) ?? primary;
    const slug = topicSlug(canon);
    if (!slug) continue;
    if (!map.has(slug)) map.set(slug, { display: canon, slug, posts: [] });
    map.get(slug)!.posts.push(p);
  }

  const now = Date.now();
  const out: (TopicAgg & { _score: number })[] = [];
  for (const g of map.values()) {
    const gpas = g.posts.map((p) => gradeToGpa(p.data.letterGrade)).filter((n): n is number => n != null);
    const leans = g.posts.map((p) => leanScoreOf(p.data)).filter((n): n is number => n != null);
    const latest = Math.max(...g.posts.map((p) => p.data.publishedAt.valueOf()));
    // Representative image: newest article in the topic that has a thumbnail.
    const byNew = [...g.posts].sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
    const thumbnail = byNew.find((p) => p.data.thumbnail)?.data.thumbnail ?? null;
    // Freshness-weighted popularity so active topics rank up and stale ones fade.
    const ageDays = (now - latest) / 86_400_000;
    const score = g.posts.length * Math.exp(-ageDays / 14);
    out.push({
      display: g.display,
      slug: g.slug,
      count: g.posts.length,
      avgGrade: gpas.length ? gpaToGrade(gpas.reduce((a, b) => a + b, 0) / gpas.length) : null,
      avgLean: leans.length ? Math.round(leans.reduce((a, b) => a + b, 0) / leans.length) : null,
      leanSpread: leans.length ? [Math.min(...leans), Math.max(...leans)] : null,
      latest,
      thumbnail,
      posts: g.posts,
      _score: score,
    });
  }
  out.sort((a, b) => b._score - a._score || b.count - a.count || b.latest - a.latest);
  return out.map(({ _score, ...t }) => t);
}
