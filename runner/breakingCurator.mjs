import { getPosts, setBreaking } from "./api.mjs";
import { isNewsOutlet } from "../src/lib/networks.ts";

const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";

// Keep the Breaking News strip filled with the most recent + important news-outlet
// reports. Recency is measured from the SOURCE video's upload time (when the news
// actually broke), heavily weighted, with a popularity bump from YouTube views.
export async function runBreakingCurator(agent) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { ok: false, message: "YOUTUBE_API_KEY not set" };

  const c = agent.config || {};
  const maxBreaking = c.maxBreaking || 10;
  const recencyHours = c.recencyHours || 36;

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

  const now = Date.now();
  const scored = [];
  for (const p of posts) {
    const m = meta[p.videoId];
    if (!m || !m.publishedAt) continue;
    const ageH = (now - new Date(m.publishedAt).getTime()) / 3_600_000;
    if (ageH > recencyHours) continue; // not breaking anymore
    const recency = Math.exp(-ageH / 10); // ~10h half-life: strongly favors the newest
    const popularity = Math.min(1, Math.log10(m.views + 10) / 7);
    const score = 0.75 * recency + 0.25 * popularity;
    scored.push({ id: p.id, score, ageH });
  }

  scored.sort((a, b) => b.score - a.score);
  const ids = scored.slice(0, maxBreaking).map((s) => s.id);
  const out = await setBreaking(ids);
  if (!out.ok) return { ok: false, message: `breaking set ${out.status}` };

  return {
    ok: true,
    message: `breaking: ${ids.length} of ${posts.length} outlet posts within ${recencyHours}h`,
    submitted: ids.length,
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
