/**
 * Dead Video Pruner. Checks every published post's source YouTube video and
 * deletes posts whose video is gone — deleted, made private, removed, or no
 * longer embeddable (so the article's embed is broken).
 *
 * Safety: we only act on videos the YouTube API actually told us about. A failed
 * or rate-limited batch is treated as "unknown" and never deleted. Deletions are
 * capped per run, and the destructive step lives in the Worker behind the agent
 * token. Deleted markdown remains in git history if a removal needs reverting.
 */
import { getPosts, prune } from "./api.mjs";

const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";

export async function runDeadVideoPruner(agent) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { ok: false, message: "YOUTUBE_API_KEY not set" };

  const c = agent.config || {};
  const maxDelete = c.maxDeletePerRun || 25;
  const dryRun = !!c.dryRun;

  const res = await getPosts();
  if (!res.ok) return { ok: false, message: `posts fetch ${res.status}` };
  const posts = (res.body.posts || []).filter((p) => p.videoId);
  if (posts.length === 0) return { ok: true, message: "no video posts", submitted: 0 };

  // videoId -> [post ids] (normally 1:1, but be safe).
  const byVideo = new Map();
  for (const p of posts) {
    if (!byVideo.has(p.videoId)) byVideo.set(p.videoId, []);
    byVideo.get(p.videoId).push(p.id);
  }
  const videoIds = [...byVideo.keys()];

  const checked = new Set(); // videoIds covered by a SUCCESSFUL API response
  const statusById = new Map();
  let apiErrors = 0;
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({ key, part: "status", id: batch.join(",") });
    let r;
    try {
      r = await fetch(`${YT_VIDEOS}?${params}`);
    } catch {
      apiErrors++;
      continue; // unknown — never delete on a network error
    }
    if (!r.ok) {
      apiErrors++;
      continue; // unknown — never delete on an API error/quota
    }
    const d = await r.json();
    for (const b of batch) checked.add(b);
    for (const it of d.items || []) statusById.set(it.id, it.status || {});
  }

  // A video is "dead" only if it was in a successful batch AND it's gone or unusable.
  const deadPostIds = [];
  let deadVideos = 0;
  for (const vid of videoIds) {
    if (!checked.has(vid)) continue; // unknown
    const st = statusById.get(vid);
    let dead = false;
    let reason = "";
    if (!st) {
      dead = true; // not returned by a successful query -> deleted or private
      reason = "gone";
    } else if (st.privacyStatus === "private") {
      dead = true;
      reason = "private";
    } else if (st.uploadStatus === "rejected" || st.uploadStatus === "deleted") {
      dead = true;
      reason = "removed";
    } else if (st.embeddable === false) {
      dead = true;
      reason = "not embeddable";
    }
    if (dead) {
      deadVideos++;
      for (const pid of byVideo.get(vid)) deadPostIds.push(pid);
    }
  }

  const checkedNote = `checked ${checked.size}/${videoIds.length} videos${apiErrors ? ` (${apiErrors} batch error[s] skipped)` : ""}`;

  if (deadPostIds.length === 0) {
    return { ok: true, submitted: 0, message: `${checkedNote}; none dead` };
  }

  const toDelete = deadPostIds.slice(0, maxDelete);
  const overflow = deadPostIds.length - toDelete.length;

  if (dryRun) {
    return {
      ok: true,
      submitted: 0,
      message: `[dry-run] ${checkedNote}; ${deadPostIds.length} dead post(s): ${toDelete.join(", ")}${overflow ? ` (+${overflow} more)` : ""}`,
    };
  }

  const out = await prune(toDelete, false);
  if (!out.ok) return { ok: false, message: `prune ${out.status}: ${JSON.stringify(out.body).slice(0, 140)}` };
  const n = out.body.count || 0;
  return {
    ok: true,
    submitted: n,
    message: `${checkedNote}; deleted ${n} dead-video post(s)${overflow ? ` (${overflow} more next run)` : ""}`,
  };
}
