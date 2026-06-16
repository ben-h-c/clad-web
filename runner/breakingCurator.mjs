import { getPosts, setBreaking } from "./api.mjs";
import { isNewsOutlet } from "../src/lib/networks.ts";
import { canonicalTopic } from "../scripts/topicsAgg.mjs";

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
    scored.push({
      id: p.id,
      headline: p.headline || "",
      topic: canonicalTopic(p.topics?.[0] || p.headline || ""),
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const maxPerTopic = c.maxPerTopic || 3;
  const chosen = [];
  const chosenTokens = [];
  const topicCount = new Map();
  // Same-story guard: a candidate is a near-duplicate of an already-chosen card
  // if their headlines share ≥3 meaningful tokens AND those cover ≥50% of the
  // smaller headline. Overlap coefficient (not Jaccard) so extra descriptive
  // words — outlet name, framing — don't hide the shared core ("trump iran deal").
  const nearDup = (tk) =>
    chosenTokens.some((t) => {
      const inter = intersect(t, tk);
      return inter >= 3 && inter / Math.min(t.size, tk.size) >= 0.5;
    });

  // Pass 1: no near-dups, and cap how many cards one broad topic can take so a
  // single dominant story can't flood the strip.
  for (const s of scored) {
    if (chosen.length >= maxBreaking) break;
    const tk = headlineTokens(s.headline);
    if (nearDup(tk)) continue;
    if ((topicCount.get(s.topic) || 0) >= maxPerTopic) continue;
    chosen.push(s);
    chosenTokens.push(tk);
    topicCount.set(s.topic, (topicCount.get(s.topic) || 0) + 1);
  }
  // Pass 2: if the strip is short on slow news days, relax the per-topic cap
  // (still never re-adding a near-duplicate).
  if (chosen.length < maxBreaking) {
    const have = new Set(chosen.map((s) => s.id));
    for (const s of scored) {
      if (chosen.length >= maxBreaking) break;
      if (have.has(s.id)) continue;
      const tk = headlineTokens(s.headline);
      if (nearDup(tk)) continue;
      chosen.push(s);
      chosenTokens.push(tk);
    }
  }
  const ids = chosen.map((s) => s.id);
  const out = await setBreaking(ids);
  if (!out.ok) return { ok: false, message: `breaking set ${out.status}` };

  return {
    ok: true,
    message: `breaking: ${ids.length} of ${posts.length} outlet posts within ${recencyHours}h`,
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
