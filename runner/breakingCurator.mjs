import { getPosts, setBreaking, getBreaking } from "./api.mjs";
import { isNewsOutlet } from "../src/lib/networks.ts";
import { ensureClassifications, classOf } from "./newsroom.mjs";
import { topicSlug } from "../scripts/topicsAgg.mjs";

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
      topic: cls.broadTopic,
      crit: cls.criticality,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Cluster same-story articles. Walking best-first, attach each article to an
  // existing cluster whose representative headline it near-duplicates (≥3 shared
  // meaningful tokens covering ≥50% of the smaller headline); otherwise start a
  // new cluster. The representative is the highest-scored member.
  const clusters = [];
  for (const s of scored) {
    const tk = headlineTokens(s.headline);
    let placed = false;
    for (const cl of clusters) {
      const inter = intersect(cl.repTokens, tk);
      if (inter >= 3 && inter / Math.min(cl.repTokens.size, tk.size) >= 0.5) {
        cl.members.push(s);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ rep: s, repTokens: tk, members: [s] });
  }

  // Order by impact: a cluster ranks by its top member's score (criticality-
  // weighted). Most impactful story first.
  clusters.sort((a, b) => b.rep.score - a.rep.score);

  // Build the ordered feed: a 2+ article cluster becomes a temporary topic group
  // (aggregated on the page); a lone article stays a single post.
  const items = [];
  for (const cl of clusters.slice(0, maxBreaking)) {
    if (cl.members.length >= 2) {
      const title =
        cl.rep.topic && cl.rep.topic.toLowerCase() !== "misc" ? cl.rep.topic : shortTitle(cl.rep.headline);
      const memberIds = cl.members.map((m) => m.id);
      items.push({ type: "group", slug: groupSlug(title, memberIds), title, ids: memberIds });
    } else {
      items.push({ type: "post", id: cl.rep.id });
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

function shortTitle(headline) {
  return String(headline || "")
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");
}
function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function groupSlug(title, ids) {
  return `${topicSlug(title) || "breaking"}-${djb2([...ids].sort().join(",")).slice(0, 6)}`;
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
