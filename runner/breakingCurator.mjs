import { getPosts, setBreaking, getBreaking } from "./api.mjs";
import { isNewsOutlet } from "../src/lib/networks.ts";
import { ensureClassifications, classOf } from "./newsroom.mjs";
import { topicSlug, canonicalTopic } from "../scripts/topicsAgg.mjs";
import { xaiLimits } from "../src/lib/xaiEconomy.ts";

const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";

// Keep the Breaking News strip filled with the genuinely most important recent
// news. Each candidate is scored on three axes — recency (when it broke),
// public interest (YouTube views + view velocity), and Grok-assigned criticality
// (inherent newsworthiness/magnitude). A stickiness margin is applied to the
// stories already on the strip, so it only swaps a card out when a new story is
// SIGNIFICANTLY more important — keeping the feed stable but always current.
//
// Resilience: if nothing scores in the primary window (or YT meta is sparse),
// fall back to post.publishedAt recency so the strip never goes blank. Never
// overwrite a populated strip with [].
export async function runBreakingCurator(agent) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { ok: false, message: "YOUTUBE_API_KEY not set" };

  const c = agent.config || {};
  const maxBreaking = c.maxBreaking || 50;
  // 72h primary window — 36h emptied the strip when drafting slowed.
  const recencyHours = c.recencyHours || 72;
  const fallbackHours = Math.max(recencyHours, Number(c.fallbackHours) || 120);
  const maxPerTopic = c.maxPerTopic || 2;
  const wR = c.recencyWeight ?? 0.35;
  const wP = c.popularityWeight ?? 0.3;
  const wC = c.criticalityWeight ?? 0.35;
  const stickiness = c.stickiness ?? 0.15;

  const res = await getPosts();
  if (!res.ok) return { ok: false, message: `posts fetch ${res.status}` };
  // Breaking News is news-outlet only, and needs a source video to time-rank.
  const posts = (res.body.posts || []).filter((p) => isNewsOutlet(p.sourceTitle) && p.videoId);
  if (posts.length === 0) {
    // Do not wipe existing strip when the corpus temporarily has no outlet posts.
    return { ok: true, message: "no eligible outlet posts — keeping existing strip", submitted: 0 };
  }

  // Pull each source video's upload time + view count (batched, 50/call, cheap).
  const meta = await fetchVideoMeta(
    posts.map((p) => p.videoId),
    key
  );

  // Grok criticality/topic for each post (cached; classifies new posts only).
  // On xAI failure ensureClassifications falls back to heuristics.
  const classMap = await ensureClassifications(posts, {
    xaiKey: process.env.XAI_API_KEY,
    maxNew: xaiLimits().classifyMaxNew,
    log: (m) => console.log(new Date().toISOString(), m),
  });

  // Which stories are already on the strip (for stickiness) — flatten groups.
  let current = new Set();
  let priorItems = [];
  try {
    const b = await getBreaking();
    if (b.ok) {
      priorItems = b.body.items || [];
      const ids = priorItems.flatMap((it) => (it.type === "group" ? it.ids : [it.id]));
      current = new Set(ids.filter(Boolean).map(String));
    }
  } catch {
    // ignore — no stickiness this run
  }

  const now = Date.now();
  let scored = scoreCandidates(posts, meta, classMap, current, now, recencyHours, wR, wP, wC, stickiness, false);
  let usedFallback = false;

  // If the tight YT window is empty (quiet news desk / stalled drafts), rank by
  // post publish time so Breaking stays populated.
  if (scored.length === 0) {
    usedFallback = true;
    scored = scoreCandidates(posts, meta, classMap, current, now, fallbackHours, wR, wP, wC, stickiness, true);
  }

  scored.sort((a, b) => b.score - a.score);

  // Group DETERMINISTICALLY by canonical broad topic.
  const groups = new Map();
  for (const s of scored) {
    const raw = s.topic && s.topic.trim() ? s.topic.trim() : "misc";
    const keyT = raw.toLowerCase().replace(/\s+/g, " ");
    if (!groups.has(keyT)) groups.set(keyT, { bucket: raw, members: [] });
    groups.get(keyT).members.push(s);
  }

  // Cap members per topic group for strip density.
  for (const g of groups.values()) {
    g.members = g.members.slice(0, Math.max(1, maxPerTopic * 3));
  }

  const ordered = [...groups.values()].sort((a, b) => b.members[0].score - a.members[0].score);

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

  if (items.length === 0) {
    // Never blank the homepage strip on a dry run.
    return {
      ok: true,
      message: `no candidates in ${fallbackHours}h window — keeping existing strip (${priorItems.length} items)`,
      submitted: 0,
    };
  }

  const out = await setBreaking(items);
  if (!out.ok) return { ok: false, message: `breaking set ${out.status}` };

  const groupCount = items.filter((i) => i.type === "group").length;
  const articleCount = items.reduce((n, i) => n + (i.type === "group" ? i.ids.length : 1), 0);
  let ambientNote = "";
  if (/staging/.test(process.env.WORKER_BASE_URL || "")) {
    try {
      const { ensureAmbientClip } = await import("./ambientClip.mjs");
      const clip = await ensureAmbientClip();
      ambientNote = `; ambient ${clip.ok ? clip.message : `skip ${clip.message}`}`;
    } catch (err) {
      ambientNote = `; ambient skip ${err?.message || err}`;
    }
  }
  return {
    ok: true,
    message: `breaking: ${items.length} items (${groupCount} grouped) covering ${articleCount} of ${posts.length} articles${usedFallback ? " [fallback recency]" : ""}, by impact${ambientNote}`,
    submitted: items.length,
  };
}

function scoreCandidates(posts, meta, classMap, current, now, recencyHours, wR, wP, wC, stickiness, usePostTime) {
  const scored = [];
  for (const p of posts) {
    const m = meta[p.videoId];
    // Prefer YouTube upload time; fall back to graded post publishedAt.
    const publishedIso =
      (!usePostTime && m?.publishedAt) || p.publishedAt || m?.publishedAt || "";
    if (!publishedIso) continue;
    const ageH = (now - new Date(publishedIso).getTime()) / 3_600_000;
    if (!Number.isFinite(ageH) || ageH < 0 || ageH > recencyHours) continue;

    const recency = Math.exp(-ageH / 18); // ~18h half-life (was 12 — less harsh)
    const views = m?.views ?? 0;
    const pop = Math.min(1, Math.log10(views + 10) / 7);
    const velocity = Math.min(1, Math.log10(views / Math.max(ageH, 1) + 10) / 5);
    // When YT stats missing, still rank on recency + criticality.
    const popularity = m ? 0.6 * pop + 0.4 * velocity : 0.25;
    const cls = classOf(p, classMap);
    const criticality = cls.criticality / 100;
    let score = wR * recency + wP * popularity + wC * criticality;
    if (current.has(p.id)) score *= 1 + stickiness;
    scored.push({
      id: p.id,
      headline: p.headline || "",
      topic: canonicalTopic(cls.broadTopic || p.headline || ""),
      crit: cls.criticality,
      score,
    });
  }
  return scored;
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
