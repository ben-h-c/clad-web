import { getPosts, setFrontpage } from "./api.mjs";
import { isNewsOutlet } from "../src/lib/networks.ts";

const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";

// Curate the home-page hero: score published reports by recency + YouTube
// popularity + engagement, then pick a diverse set (per-topic cap) up to a
// max. Topic contrast (e.g. a left and a right take on one story) is allowed
// within the cap; flooding one topic is not.
export async function runFrontpageCurator(agent) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { ok: false, message: "YOUTUBE_API_KEY not set" };

  const c = agent.config || {};
  const maxFeatured = c.maxFeatured || 15;
  const perTopicCap = c.perTopicCap || 2;
  const wR = c.recencyWeight ?? 0.45;
  const wP = c.popularityWeight ?? 0.4;
  const wE = c.engagementWeight ?? 0.15;

  const res = await getPosts();
  if (!res.ok) return { ok: false, message: `posts fetch ${res.status}` };
  const allPosts = res.body.posts || [];
  // Editorial rule: only established news outlets are eligible for the front page.
  const posts = allPosts.filter((p) => isNewsOutlet(p.sourceTitle));
  if (posts.length === 0) {
    await setFrontpage([]);
    return {
      ok: true,
      message: `no news-outlet posts (of ${allPosts.length} published)`,
      submitted: 0,
    };
  }

  // YouTube stats for the posts that have a video id (batched, 50 per call).
  const stats = await fetchStats(posts.map((p) => p.videoId).filter(Boolean), key);

  const now = Date.now();
  const scored = posts.map((p) => {
    const ageH = (now - new Date(p.publishedAt).getTime()) / 3_600_000;
    const recency = Math.exp(-ageH / 72); // ~3-day half-life
    const s = (p.videoId && stats[p.videoId]) || { views: 0, likes: 0, comments: 0 };
    const popularity = Math.min(1, Math.log10(s.views + 10) / 7); // ~10M views -> 1
    const engagement = Math.min(1, (s.likes + s.comments) / (s.views + 1) / 0.05);
    const score = wR * recency + wP * popularity + wE * engagement;
    return { ...p, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // Diversity-aware greedy selection.
  const topicCount = new Map();
  const chosen = [];
  for (const p of scored) {
    if (chosen.length >= maxFeatured) break;
    const topic = (p.topics?.[0] || p.headline || "").toLowerCase().trim() || "misc";
    const n = topicCount.get(topic) || 0;
    if (n >= perTopicCap) continue;
    topicCount.set(topic, n + 1);
    chosen.push(p);
  }
  // If the cap left us short of maxFeatured (few topics), backfill by score.
  if (chosen.length < maxFeatured) {
    const have = new Set(chosen.map((p) => p.id));
    for (const p of scored) {
      if (chosen.length >= maxFeatured) break;
      if (!have.has(p.id)) chosen.push(p);
    }
  }

  const ids = chosen.slice(0, maxFeatured).map((p) => p.id);
  const out = await setFrontpage(ids);
  if (!out.ok) return { ok: false, message: `frontpage set ${out.status}` };

  return {
    ok: true,
    message: `featured ${ids.length} of ${posts.length} across ${topicCount.size} topics`,
    submitted: ids.length,
  };
}

async function fetchStats(videoIds, key) {
  const out = {};
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const p = new URLSearchParams({ key, part: "statistics", id: batch.join(",") });
    try {
      const r = await fetch(`${YT_VIDEOS}?${p}`);
      if (!r.ok) continue;
      const d = await r.json();
      for (const it of d.items || []) {
        const st = it.statistics || {};
        out[it.id] = {
          views: Number(st.viewCount || 0),
          likes: Number(st.likeCount || 0),
          comments: Number(st.commentCount || 0),
        };
      }
    } catch {
      // skip batch on error
    }
  }
  return out;
}
