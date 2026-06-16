import { getPosts, setBreaking, getBreaking } from "./api.mjs";
import { isNewsOutlet } from "../src/lib/networks.ts";
import { ensureClassifications, classOf } from "./newsroom.mjs";

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
  const maxBreaking = c.maxBreaking || 10;
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

  // Which stories are already on the strip (for stickiness).
  let current = new Set();
  try {
    const b = await getBreaking();
    if (b.ok) current = new Set((b.body.ids || []).map(String));
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
      topic: cls.broadTopic,
      crit: cls.criticality,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const chosen = [];
  const chosenTokens = [];
  const topicCount = new Map();
  const nearDup = (tk) =>
    chosenTokens.some((t) => {
      const inter = intersect(t, tk);
      return inter >= 3 && inter / Math.min(t.size, tk.size) >= 0.5;
    });
  const take = (s, capped) => {
    const tk = headlineTokens(s.headline);
    if (nearDup(tk)) return false;
    if (capped && (topicCount.get(s.topic) || 0) >= maxPerTopic) return false;
    chosen.push(s);
    chosenTokens.push(tk);
    topicCount.set(s.topic, (topicCount.get(s.topic) || 0) + 1);
    return true;
  };

  // Pass 1: top stories, no near-dups, per-topic cap so one story can't flood.
  for (const s of scored) {
    if (chosen.length >= maxBreaking) break;
    take(s, true);
  }
  // Pass 2: relax the cap if short on slow news days (still no near-dups).
  if (chosen.length < maxBreaking) {
    const have = new Set(chosen.map((s) => s.id));
    for (const s of scored) {
      if (chosen.length >= maxBreaking) break;
      if (!have.has(s.id)) take(s, false);
    }
  }

  const ids = chosen.map((s) => s.id);
  const out = await setBreaking(ids);
  if (!out.ok) return { ok: false, message: `breaking set ${out.status}` };

  const carried = ids.filter((id) => current.has(id)).length;
  const avgCrit = chosen.length
    ? Math.round(chosen.reduce((a, s) => a + s.crit, 0) / chosen.length)
    : 0;
  return {
    ok: true,
    message: `breaking: ${ids.length} of ${posts.length} (avg criticality ${avgCrit}, ${carried} carried over)`,
    submitted: ids.length,
  };
}

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
function intersect(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter;
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
