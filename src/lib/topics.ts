/**
 * Topic aggregation for the home-page dashboard. Articles are grouped by the
 * topics Grok tags them with; each group gets an aggregate letter grade
 * (mean GPA), an average political-lean score, and — when the caller passes
 * the KV sentiment map — an average social-media sentiment.
 */
import type { CollectionEntry } from "astro:content";
import type { SentimentMap } from "./agents";

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
  // Average social-media sentiment across scanned posts; null when no post in
  // the group has been scanned (or the caller didn't pass the sentiment map).
  avgSentiment: number | null;
  leanSpread: [number, number] | null;
  latest: number;
  thumbnail: string | null;
  posts: CollectionEntry<"posts">[];
}

const TOPIC_STOP = new Set(
  "the a an of and or to in on for at by with news update updates the".split(" ")
);
// Conservative singularizer so "Venezuela earthquake" and "Venezuela
// earthquakes" tokenize identically. Only strips a plain plural when the
// stem stays ≥4 chars, and never touches -ss/-us/-is endings (congress,
// virus, crisis) — under-merging beats folding unrelated topics together.
function singularize(w: string): string {
  if (/(?:ss|us|is)$/.test(w)) return w;
  if (/(?:sh|ch|x|z|s)es$/.test(w) && w.length >= 6) return w.slice(0, -2);
  if (w.endsWith("s") && w.length >= 5) return w.slice(0, -1);
  return w;
}
function topicTokens(t: string): Set<string> {
  return new Set(
    t
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !TOPIC_STOP.has(w))
      .map(singularize)
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

// Broad canonical buckets: Grok tags articles with very specific topics ("US-Iran
// deal", "SpaceX IPO", "SpaceX launches"…), which fragments the Topics section.
// We fold a topic into a broad bucket when it matches; order matters (most
// specific first). Anything unmatched falls through to token clustering below.
const TOPIC_BUCKETS: [RegExp, string][] = [
  [/\biran\b|hormuz|tehran|jcpoa/i, "Iran"],
  [/gaza|israel|hamas|\bidf\b|hezbollah|netanyahu|west bank/i, "Israel & Gaza"],
  [/ukraine|russia|putin|zelensky|kremlin/i, "Ukraine & Russia"],
  [/\bchina\b|taiwan|xi jinping|south china|beijing/i, "China"],
  [/spacex|starship|starlink/i, "SpaceX"],
  [/tesla|cybertruck|cybercab|\bfsd\b/i, "Tesla"],
  [/world cup|\bfifa\b/i, "World Cup 2026"],
  [/\bnba\b|knicks|\bnfl\b|super bowl|playoff|finals|championship/i, "Sports"],
  [/artificial intelligence|\bai\b|openai|anthropic|\bgrok\b|chatgpt|\bllm\b|gemini|nvidia|data center/i, "AI & Tech"],
  [/bitcoin|crypto|ethereum|\bbtc\b/i, "Crypto"],
  [/stock|wall street|s&p|nasdaq|\bdow\b|\bipo\b|earnings|\bmarket\b/i, "Markets"],
  [/inflation|federal reserve|\bfed\b|interest rate|jobs report|\beconomy\b|housing|tariff|\bgdp\b|recession/i, "Economy"],
  [/election|mayoral|primary|ballot|\bvoter|\bpoll/i, "Elections"],
  [/supreme court|scotus|\bcourt\b|lawsuit|\bdoj\b|indictment|ruling|\bjudge/i, "Courts & Law"],
  [/immigration|\bborder\b|deportation|uscis|\bvisa\b|migrant|ice raid/i, "Immigration"],
  [/congress|senate|filibuster|shutdown|\bspeaker\b/i, "Congress"],
  [/\bufc\b/i, "White House UFC"],
  [/\bg7\b|\bg20\b|\bnato\b|\bsummit\b|foreign policy|diplomacy/i, "Foreign Policy"],
  [/\bmusk\b/i, "Elon Musk"],
  [/newsom|desantis|\bharris\b|\bbiden\b/i, "US Politics"],
  [/\btrump\b/i, "Trump"],
];
// Human-friendly canonical topic labels, surfaced as alert/interest suggestions.
export const TOPIC_LABELS: string[] = [...new Set(TOPIC_BUCKETS.map(([, label]) => label))];

function bucketize(topic: string): string | null {
  for (const [re, label] of TOPIC_BUCKETS) if (re.test(topic)) return label;
  return null;
}
export function canonicalTopic(t: string): string {
  return bucketize(t) ?? t.trim();
}

export function aggregateTopics(
  posts: CollectionEntry<"posts">[],
  sentiments: SentimentMap = {}
): TopicAgg[] {
  // 1) group articles by exact topic string
  const byTopic = new Map<string, CollectionEntry<"posts">[]>();
  for (const p of posts) {
    for (const t of p.data.topics ?? []) {
      const key = canonicalTopic(t);
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
    const primaryRaw = (p.data.topics?.[0] ?? "").trim();
    if (!primaryRaw) continue;
    const primary = canonicalTopic(primaryRaw);
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
    const sentis = g.posts
      .map((p) => sentiments[p.id]?.score)
      .filter((n): n is number => typeof n === "number");
    const latest = Math.max(...g.posts.map((p) => p.data.publishedAt.valueOf()));
    // Representative image: newest article in the topic that has a thumbnail.
    const byNew = [...g.posts].sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
    const thumbnail = byNew.find((p) => p.data.thumbnail)?.data.thumbnail ?? null;
    // Trending popularity: each article contributes by its OWN recency, so
    // topics with active, recent coverage rank up while a large-but-stale
    // backlog fades — total article count no longer dominates the order.
    // Sum of per-article freshness decay (14-day time constant).
    const score = g.posts.reduce(
      (s, p) => s + Math.exp(-((now - p.data.publishedAt.valueOf()) / 86_400_000) / 14),
      0
    );
    out.push({
      display: g.display,
      slug: g.slug,
      count: g.posts.length,
      avgGrade: gpas.length ? gpaToGrade(gpas.reduce((a, b) => a + b, 0) / gpas.length) : null,
      avgLean: leans.length ? Math.round(leans.reduce((a, b) => a + b, 0) / leans.length) : null,
      avgSentiment: sentis.length ? Math.round(sentis.reduce((a, b) => a + b, 0) / sentis.length) : null,
      leanSpread: leans.length ? [Math.min(...leans), Math.max(...leans)] : null,
      latest,
      thumbnail,
      posts: g.posts,
      _score: score,
    });
  }
  out.sort((a, b) => b._score - a._score || b.count - a.count || b.latest - a.latest);
  // A topic is for grouping MULTIPLE like articles — drop singletons.
  return out.filter((t) => t.count >= 2).map(({ _score, ...t }) => t);
}
