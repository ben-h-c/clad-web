/**
 * Cover lead may only be a full-frame (landscape) broadcast.
 * Phone-sized YouTube Shorts stay in the Breaking strip — never the top plate.
 */

export type VideoFrame = "full" | "phone";

const FRAME_KEY = (id: string) => `video:frame:${id}`;
const FRAME_TTL = 60 * 60 * 24 * 14;

export function isVideoId(id: string | null | undefined): id is string {
  return !!id && /^[\w-]{11}$/.test(id);
}

/** Cheap local hint — Shorts titles/URLs never go on the Cover. */
export function frameHintFromText(title: string | null | undefined, url?: string | null): VideoFrame | null {
  const blob = `${title || ""} ${url || ""}`;
  if (/#shorts\b/i.test(blob) || /\/shorts\//i.test(blob)) return "phone";
  return null;
}

export function isFullFrame(width: number, height: number): boolean {
  return width > 0 && height > 0 && width >= height;
}

export async function loadVideoFrame(kv: KVNamespace, videoId: string): Promise<VideoFrame | null> {
  if (!isVideoId(videoId)) return null;
  const raw = await kv.get(FRAME_KEY(videoId));
  return raw === "full" || raw === "phone" ? raw : null;
}

export async function storeVideoFrame(kv: KVNamespace, videoId: string, frame: VideoFrame): Promise<void> {
  if (!isVideoId(videoId)) return;
  await kv.put(FRAME_KEY(videoId), frame, { expirationTtl: FRAME_TTL });
}

/**
 * YouTube serves real Shorts at /shorts/ID (200). Landscape videos 303 to /watch.
 */
export async function probeYoutubeFrame(videoId: string): Promise<VideoFrame | null> {
  if (!isVideoId(videoId)) return null;
  try {
    const r = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: "HEAD",
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CladFacts/1.0)" },
      signal: AbortSignal.timeout(4000),
    });
    if (r.status === 200) return "phone";
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location") || "";
      return /\/shorts\//i.test(loc) ? "phone" : "full";
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function resolveVideoFrame(
  kv: KVNamespace,
  videoId: string,
  hint: VideoFrame | null = null
): Promise<VideoFrame | null> {
  if (hint) {
    await storeVideoFrame(kv, videoId, hint).catch(() => {});
    return hint;
  }
  const cached = await loadVideoFrame(kv, videoId);
  if (cached) return cached;
  const probed = await probeYoutubeFrame(videoId);
  if (probed) await storeVideoFrame(kv, videoId, probed).catch(() => {});
  return probed;
}
