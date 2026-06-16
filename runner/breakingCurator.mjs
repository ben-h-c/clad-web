import { getPosts, setBreaking, getBreaking } from "./api.mjs";
import { isNewsOutlet } from "../src/lib/networks.ts";
import { ensureClassifications, classOf } from "./newsroom.mjs";
import { topicSlug, canonicalTopic } from "../scripts/topicsAgg.mjs";

const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";

// Keep the Breaking News strip filled with the genuinely most important recent
// news. Each candidate is scored on three axes — recency (when it broke),
// public interest (YouTube views + view velocity), and Grok-assigned criticality
// (inherent newsworthiness/magnitude). A stickiness margin is applied to the
// stories already on the strip, so it only swaps a card out when a new story is
// SIGNIFICANTLY more important — keeping the feed stable but always current.
export async function runBreakingCurator(agent) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { ok: false, message: "YOUTUBE_API_KEY not set" };

  const c = agent.config || {};
  const maxBreaking = c.maxBreaking || 50;
  const recencyHours = c.recencyHours || 36;
  const maxPerTopic = c.maxPerTopic || 2;
  const wR = c.recencyWeight ?? 0.35;
  const wP = c.popularityWeight ?? 0.3;
  const wC = c.criticalityWeight ?? 0.35;
  const stickiness = c.stickiness ?? 0.15; // current cards get +15% so marginal challengers can't churn them

  const res = await getPosts();
  if (!res.ok) return { ok: false, message: `posts fetch ${res.status}` };
  // Breaking News is news-outlet only, and needs a source video to time-rank.
  const posts = (res.body.posts || []).filter((p) => isNewsOutlet(p.sourceTitle) && p.videoId);
  if (posts.length === 0) {
    await setBreaking([]);
    return { ok: true, message: "no eligible outlet posts", submitted: 0 };
  }

  // Pull each source video's upload time + view count (batched, 50/call, cheap).
  const meta = await fetchVideoMeta(posts.map((p) => p.videoId), key);

  // Grok criticality/topic for each post (cached; classifies new posts only).
  const classMap = await ensureClassifications(posts, {
    xaiKey: process.env.XAI_API_KEY,
    log: (m) => console.log(new Date().toISOString(), m),
  });

  // Which stories are already on the strip (for stickiness) — flatten groups.
  let current = new Set();
  try {
    const b = await getBreaking();
    if (b.ok) {
      const ids = (b.body.items || []).flatMap((it) => (it.type === "group" ? it.ids : [it.id]));
      current = new Set(ids.filter(Boolean).map(String));
    }
  } catch {
    // ignore — no stickiness this run
  }

  const now = Date.now();
  const scored = [];
  for (const p of posts) {
    const m = meta[p.videoId];
    if (!m || !m.publishedAt) continue;
    const ageH = (now - new Date(m.publishedAt).getTime()) / 3_600_000;
    if (ageH > recencyHours) continue; // not breaking anymore
    const recency = Math.exp(-ageH / 12); // ~12h half-life
    const pop = Math.min(1, Math.log10(m.views + 10) / 7); // ~10M views -> 1
    const velocity = Math.min(1, Math.log10(m.views / Math.max(ageH, 1) + 10) / 5); // views/hour (trending)
    const popularity = 0.6 * pop + 0.4 * velocity;
    const cls = classOf(p, classMap);
    const criticality = cls.criticality / 100;
    let score = wR * recency + wP * popularity + wC * criticality;
    if (current.has(p.id)) score *= 1 + stickiness; // incumbents are sticky
    scored.push({
      id: p.id,
      headline: p.headline || "",
      // Normalize the classifier's free-form topic to a canonical bucket so all
      // coverage of one subject groups consistently (e.g. "Iran Deal",
      // "US-Iran Deal" → "Iran"), matching the Topics section.
      topic: canonicalTopic(cls.broadTopic || p.headline || ""),
      crit: cls.criticality,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Group DETERMINISTICALLY by canonical broad topic (the same buckets the
  // Topics section uses), so coverage of one subject always lands in a single
  // consistent group instead of fragmenting by headline wording. Members keep
  // score order (scored is already sorted desc).
  const groups = new Map();
  for (const s of scored) {
    const key = s.topic && s.topic.trim() ? s.topic.trim() : "misc";
    if (!groups.has(key)) groups.set(key, { bucket: key, members: [] });
    groups.get(key).members.push(s);
  }

  // Order groups by impact: each ranks by its strongest member's score.
  const ordered = [...groups.values()].sort((a, b) => b.members[0].score - a.members[0].score);

  // 2+ articles → a temporary topic group; a lone article stays a single post.
  // slug stays the stable topic bucket; the title is the lead story's headline
  // (more descriptive than the bare bucket name).
  const items = [];
  for (const g of ordered.slice(0, maxBreaking)) {
    if (g.members.length >= 2) {
      const lead = g.members[0];
      const title = (lead.headline || g.bucket).slice(0, 140);
      items.push({
        type: "group",
        slug: topicSlug(g.bucket) || "breaking",
        topic: g.bucket,
        title,
        ids: g.members.map((m) => m.id),
      });
    } else {
      items.push({ type: "post", id: g.members[0].id });
    }
  }

  const out = await setBreaking(items);
  if (!out.ok) return { ok: false, message: `breaking set ${out.status}` };

  const groupCount = items.filter((i) => i.type === "group").length;
  const articleCount = items.reduce((n, i) => n + (i.type === "group" ? i.ids.length : 1), 0);
  return {
    ok: true,
    message: `breaking: ${items.length} items (${groupCount} grouped) covering ${articleCount} of ${posts.length} articles, by impact`,
    submitted: items.length,
  };
}

async function fetchVideoMeta(videoIds, key) {
  const ids = [...new Set(videoIds.filter(Boolean))];
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const p = new URLSearchParams({ key, part: "snippet,statistics", id: batch.join(",") });
    try {
      const r = await fetch(`${YT_VIDEOS}?${p}`);
      if (!r.ok) continue;
      const d = await r.json();
      for (const it of d.items || []) {
        out[it.id] = {
          publishedAt: it.snippet?.publishedAt || "",
          views: Number(it.statistics?.viewCount || 0),
        };
      }
    } catch {
      // skip batch on error
    }
  }
  return out;
}
