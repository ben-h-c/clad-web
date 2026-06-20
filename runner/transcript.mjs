/**
 * Fetch YouTube transcripts via a hosted transcript API, and video metadata via
 * the official YouTube Data API. NO yt-dlp, NO subprocess, NO residential IP —
 * everything here is a plain HTTPS call, so the runner can live in any cloud
 * container instead of on a Mac.
 *
 * Transcript provider is configured via env (runner/.env):
 *   TRANSCRIPT_API_URL   e.g. https://api.supadata.ai/v1/youtube/transcript
 *   TRANSCRIPT_API_KEY   provider key
 *   TRANSCRIPT_API_KEY_HEADER  header to send the key in (default: x-api-key;
 *                              set to "Authorization" to send "Bearer <key>")
 *
 * Expected response: any of a raw string, { content | transcript | text: "..." },
 * or an array / { content: [...] } of segments with text|snippet fields. The
 * parser below is deliberately tolerant so most providers work unchanged.
 *
 * Metadata uses YOUTUBE_API_KEY (videos.list, part=snippet — 1 quota unit, not
 * the 100-unit search call), so it stays cheap and datacenter-safe.
 */

const TRANSCRIPT_API_URL = process.env.TRANSCRIPT_API_URL || "";
const TRANSCRIPT_API_KEY = process.env.TRANSCRIPT_API_KEY || "";
const TRANSCRIPT_KEY_HEADER = process.env.TRANSCRIPT_API_KEY_HEADER || "x-api-key";

const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";

function authHeaders() {
  if (!TRANSCRIPT_API_KEY) return {};
  if (TRANSCRIPT_KEY_HEADER.toLowerCase() === "authorization") {
    return { Authorization: `Bearer ${TRANSCRIPT_API_KEY}` };
  }
  return { [TRANSCRIPT_KEY_HEADER]: TRANSCRIPT_API_KEY };
}

/**
 * Return the caption text for a video, or null when it genuinely has none (or
 * the provider can't supply one). Never throws — callers treat null as "skip".
 */
export async function fetchTranscript(videoId, timeoutMs = 45000) {
  if (!TRANSCRIPT_API_URL) return null; // not configured → no transcript
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  // Pass both `url` and `videoId` so providers that key off either one work.
  const sep = TRANSCRIPT_API_URL.includes("?") ? "&" : "?";
  const reqUrl =
    `${TRANSCRIPT_API_URL}${sep}url=${encodeURIComponent(watchUrl)}` +
    `&videoId=${encodeURIComponent(videoId)}&lang=en&text=true`;
  try {
    const res = await fetch(reqUrl, {
      headers: { Accept: "application/json", ...authHeaders() },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null; // 404 / transcript-unavailable / etc. → skip
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : await res.text();
    const text = normalizeTranscript(data);
    return text.length >= 80 ? text : null;
  } catch {
    return null; // timeout / network / parse → treated as no transcript
  }
}

/**
 * Real channel + title via the YouTube Data API (so a source shows the network,
 * not "youtube.com", and same-network dedup works). Returns { channel, title }
 * or null. Never throws.
 */
export async function fetchVideoMeta(videoId, timeoutMs = 20000) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const params = new URLSearchParams({ key, part: "snippet", id: videoId });
  try {
    const res = await fetch(`${YT_VIDEOS}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const s = data?.items?.[0]?.snippet;
    if (!s) return null;
    return {
      channel: (s.channelTitle || "").trim() || null,
      title: (s.title || "").trim() || null,
    };
  } catch {
    return null;
  }
}

/**
 * Coerce whatever the transcript provider returned into a single plain-text
 * string. Handles a raw string, common single-field objects, and arrays of
 * segments (under `content`, `transcript`, `segments`, `events`, or the top
 * level).
 */
function normalizeTranscript(data) {
  if (data == null) return "";
  if (typeof data === "string") return clean(data);

  // Single-field text responses.
  for (const k of ["content", "transcript", "text"]) {
    if (typeof data[k] === "string") return clean(data[k]);
  }

  // Segment arrays — either the value itself or one of the usual wrappers.
  const arr = Array.isArray(data)
    ? data
    : data.content || data.transcript || data.segments || data.events || null;
  if (Array.isArray(arr)) {
    const text = arr
      .map((seg) => {
        if (typeof seg === "string") return seg;
        if (seg && typeof seg === "object") {
          return seg.text || seg.snippet || seg.utf8 || seg.content || "";
        }
        return "";
      })
      .join(" ");
    return clean(text);
  }
  return "";
}

function clean(s) {
  return String(s).replace(/\s+/g, " ").trim();
}
