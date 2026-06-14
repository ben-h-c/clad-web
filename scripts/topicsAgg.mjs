/**
 * Plain-JS port of the topic aggregation in src/lib/topics.ts, used by the
 * build-time OG image generator. Kept in JS (not importing the .ts) so the
 * Astro build/config load path never has to resolve a TypeScript module.
 * Must stay in sync with src/lib/topics.ts so topic slugs/grouping match the
 * live /topics/<slug>/ pages.
 */
const GPA = {
  "A+": 12, A: 11, "A-": 10, "B+": 9, B: 8, "B-": 7,
  "C+": 6, C: 5, "C-": 4, "D+": 3, D: 2, "D-": 1, F: 0,
};
const GPA_LIST = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
const ENUM_TO_SCORE = { left: -80, "center-left": -40, center: 0, "center-right": 40, right: 80, none: 0 };

function gradeToGpa(g) {
  return g && g in GPA ? GPA[g] : null;
}
function gpaToGrade(n) {
  return GPA_LIST[Math.max(0, Math.min(12, Math.round(n)))];
}
function leanScoreOf(data) {
  if (typeof data.leanScore === "number") return data.leanScore;
  return data.politicalLean ? (ENUM_TO_SCORE[data.politicalLean] ?? 0) : null;
}

export function topicSlug(t) {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);
}

const TOPIC_STOP = new Set(
  "the a an of and or to in on for at by with news update updates the".split(" ")
);
function topicTokens(t) {
  return new Set(
    t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 2 && !TOPIC_STOP.has(w))
  );
}
function topicSim(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if ([...small].every((x) => big.has(x))) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function aggregateTopics(posts) {
  const byTopic = new Map();
  for (const p of posts) {
    for (const t of p.data.topics ?? []) {
      const key = t.trim();
      if (!key) continue;
      if (!byTopic.has(key)) byTopic.set(key, []);
      byTopic.get(key).push(p);
    }
  }

  const distinct = [...byTopic.keys()].sort(
    (a, b) => byTopic.get(b).length - byTopic.get(a).length || a.length - b.length
  );
  const anchors = [];
  const canonOf = new Map();
  for (const t of distinct) {
    const tt = topicTokens(t);
    let best = null;
    let bestSim = 0;
    for (const a of anchors) {
      const s = topicSim(tt, a.tokens);
      if (s > bestSim) { bestSim = s; best = a; }
    }
    if (best && bestSim >= 0.5) canonOf.set(t, best.topic);
    else { anchors.push({ topic: t, tokens: tt }); canonOf.set(t, t); }
  }

  const map = new Map();
  for (const p of posts) {
    const primary = (p.data.topics?.[0] ?? "").trim();
    if (!primary) continue;
    const canon = canonOf.get(primary) ?? primary;
    const slug = topicSlug(canon);
    if (!slug) continue;
    if (!map.has(slug)) map.set(slug, { display: canon, slug, posts: [] });
    map.get(slug).posts.push(p);
  }

  const now = Date.now();
  const out = [];
  for (const g of map.values()) {
    const gpas = g.posts.map((p) => gradeToGpa(p.data.letterGrade)).filter((n) => n != null);
    const leans = g.posts.map((p) => leanScoreOf(p.data)).filter((n) => n != null);
    const latest = Math.max(...g.posts.map((p) => p.data.publishedAt.valueOf()));
    const byNew = [...g.posts].sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
    const thumbnail = byNew.find((p) => p.data.thumbnail)?.data.thumbnail ?? null;
    const ageDays = (now - latest) / 86_400_000;
    const score = g.posts.length * Math.exp(-ageDays / 14);
    out.push({
      display: g.display,
      slug: g.slug,
      count: g.posts.length,
      avgGrade: gpas.length ? gpaToGrade(gpas.reduce((a, b) => a + b, 0) / gpas.length) : null,
      avgLean: leans.length ? Math.round(leans.reduce((a, b) => a + b, 0) / leans.length) : null,
      thumbnail,
      _score: score,
      latest,
    });
  }
  out.sort((a, b) => b._score - a._score || b.count - a.count || b.latest - a.latest);
  return out;
}
