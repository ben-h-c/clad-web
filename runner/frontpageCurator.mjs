import { getPosts, setFrontpage } from "./api.mjs";
import { isNewsOutlet } from "../src/lib/networks.ts";
import { ensureClassifications, classOf, frontPageEligible } from "./newsroom.mjs";

const HEADLINE_STOP = new Set(
  ("the a an of to in on for and or with at by is are was were as that this it amid after over " +
    "new news says say said report reports covers segment video clip interview").split(" ")
);
function headlineTokens(s) {
  return new Set(
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !HEADLINE_STOP.has(w))
  );
}
// Near-duplicate if headlines share >=3 meaningful tokens covering >=50% of the
// smaller one (overlap coefficient — robust to extra outlet/framing words).
function isNearDup(tk, chosenTokens) {
  return chosenTokens.some((t) => {
    let inter = 0;
    for (const x of t) if (tk.has(x)) inter++;
    return inter >= 3 && inter / Math.min(t.size, tk.size) >= 0.5;
  });
}

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
  // Editorial rule: established news outlets, and the Front Page is for cool,
  // lighter recent stories — not politics or tragedies. Grok classifies each post
  // (lighthearted? broad topic?) so this self-adjusts without keyword upkeep;
  // heuristics fill in for anything not yet classified.
  const outlets = allPosts.filter((p) => isNewsOutlet(p.sourceTitle));
  const classMap = await ensureClassifications(outlets, {
    xaiKey: process.env.XAI_API_KEY,
    log: (m) => console.log(new Date().toISOString(), m),
  });
  const light = (p) => frontPageEligible(p, classMap);
  const topicOf = (p) => classOf(p, classMap).broadTopic;

  // Prefer outlet + light; if that pool is thin, drop the outlet restriction
  // (still light) so the page stays full; only as a last resort fall back to
  // outlet posts of any kind.
  let pool = outlets.filter(light);
  if (pool.length < 6) {
    const anyLight = allPosts.filter(light);
    if (anyLight.length > pool.length) pool = anyLight;
  }
  if (pool.length === 0) pool = outlets;
  if (pool.length === 0) {
    await setFrontpage([]);
    return {
      ok: true,
      message: `no eligible posts (of ${allPosts.length} published)`,
      submitted: 0,
    };
  }

  // YouTube stats for the posts that have a video id (batched, 50 per call).
  const stats = await fetchStats(pool.map((p) => p.videoId).filter(Boolean), key);

  const now = Date.now();
  const scored = pool.map((p) => {
    const ageH = (now - new Date(p.publishedAt).getTime()) / 3_600_000;
    const recency = Math.exp(-ageH / 72); // ~3-day half-life
    const s = (p.videoId && stats[p.videoId]) || { views: 0, likes: 0, comments: 0 };
    const popularity = Math.min(1, Math.log10(s.views + 10) / 7); // ~10M views -> 1
    const engagement = Math.min(1, (s.likes + s.comments) / (s.views + 1) / 0.05);
    const score = wR * recency + wP * popularity + wE * engagement;
    return { ...p, score };
  });

  // Group by BROAD topic (canonical bucket) so slight variants of one story
  // ("Trump Iran deal", "US-Iran MOU", "Iran deal framework") collapse into one
  // group — otherwise round-robin gives each a slot and the page floods with a
  // single story.
  const groups = new Map();
  for (const p of scored) {
    const topic = topicOf(p) || "misc";
    if (!groups.has(topic)) groups.set(topic, []);
    groups.get(topic).push(p);
  }
  for (const arr of groups.values()) arr.sort((a, b) => b.score - a.score);

  // Order topics by their best post's score, but jitter it so the lineup ROTATES
  // run to run (keeps the front page fluid/interesting instead of static), while
  // still favoring strong, recent topics.
  const topicList = [...groups.values()].map((arr) => ({
    arr,
    rank: arr[0].score * (0.7 + Math.random() * 0.6),
  }));
  topicList.sort((a, b) => b.rank - a.rank);

  // Round-robin across topics: take the best from each topic first (widest range
  // of topics), then a second from each, up to perTopicCap rounds. Skip any post
  // whose headline near-duplicates one already chosen (same story, different
  // outlet/phrasing) so the page never shows the same story twice.
  const chosen = [];
  const chosenTokens = [];
  const take = (p) => {
    const tk = headlineTokens(p.headline);
    if (isNearDup(tk, chosenTokens)) return false;
    chosen.push(p);
    chosenTokens.push(tk);
    return true;
  };
  for (let round = 0; round < perTopicCap && chosen.length < maxFeatured; round++) {
    for (const t of topicList) {
      if (chosen.length >= maxFeatured) break;
      if (t.arr[round]) take(t.arr[round]);
    }
  }
  // Backfill by score if still short, but keep the per-topic cap so a thin pool
  // can't fill the page with one topic (e.g. four SpaceX-IPO takes). Better a
  // shorter, varied page than a repetitive full one.
  if (chosen.length < maxFeatured) {
    const topicCount = new Map();
    for (const p of chosen) {
      const t = topicOf(p);
      topicCount.set(t, (topicCount.get(t) || 0) + 1);
    }
    const have = new Set(chosen.map((p) => p.id));
    for (const p of [...scored].sort((a, b) => b.score - a.score)) {
      if (chosen.length >= maxFeatured) break;
      if (have.has(p.id)) continue;
      const t = topicOf(p);
      if ((topicCount.get(t) || 0) >= perTopicCap) continue;
      if (take(p)) topicCount.set(t, (topicCount.get(t) || 0) + 1);
    }
  }

  const ids = chosen.slice(0, maxFeatured).map((p) => p.id);
  const out = await setFrontpage(ids);
  if (!out.ok) return { ok: false, message: `frontpage set ${out.status}` };

  const topicsCovered = new Set(
    chosen.slice(0, maxFeatured).map((p) => topicOf(p))
  ).size;
  return {
    ok: true,
    message: `featured ${ids.length} of ${pool.length} lighthearted across ${topicsCovered} topics (rotating)`,
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
