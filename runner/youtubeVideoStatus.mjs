/**
 * Lightweight YouTube status check before we spend a Grok draft on a video.
 * Uses the Data API (1 unit per up-to-50 ids). Fail-open on API errors so a
 * quota blip doesn't stall the newsroom — only skip when the API positively
 * says the video is gone or not public/embeddable.
 */
const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";

/**
 * @param {string[]} videoIds
 * @param {string} [apiKey]
 * @returns {Promise<Map<string, { ok: boolean, reason?: string }>>}
 */
export async function checkVideosPublic(videoIds, apiKey = process.env.YOUTUBE_API_KEY) {
  const out = new Map();
  if (!apiKey || videoIds.length === 0) {
    for (const id of videoIds) out.set(id, { ok: true, reason: "unchecked" });
    return out;
  }
  const unique = [...new Set(videoIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    let data;
    try {
      const params = new URLSearchParams({ key: apiKey, part: "status", id: batch.join(",") });
      const r = await fetch(`${YT_VIDEOS}?${params}`);
      if (!r.ok) {
        for (const id of batch) out.set(id, { ok: true, reason: "api-error" });
        continue;
      }
      data = await r.json();
    } catch {
      for (const id of batch) out.set(id, { ok: true, reason: "network-error" });
      continue;
    }
    const found = new Map((data.items || []).map((it) => [it.id, it.status || {}]));
    for (const id of batch) {
      const st = found.get(id);
      if (!st) {
        // In a successful batch but missing → deleted/private/gone.
        out.set(id, { ok: false, reason: "missing" });
        continue;
      }
      const privacy = st.privacyStatus || "";
      const embeddable = st.embeddable !== false;
      if (privacy && privacy !== "public" && privacy !== "unlisted") {
        out.set(id, { ok: false, reason: `privacy:${privacy}` });
      } else if (!embeddable) {
        out.set(id, { ok: false, reason: "not-embeddable" });
      } else {
        out.set(id, { ok: true });
      }
    }
  }
  return out;
}

/** @param {string} videoId */
export async function isVideoDraftable(videoId) {
  const map = await checkVideosPublic([videoId]);
  return map.get(videoId) ?? { ok: true, reason: "unchecked" };
}
