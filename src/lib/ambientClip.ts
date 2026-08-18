/**
 * Same-origin Cover-lead clip. A short muted H264 loop of the lead's own
 * source video, prepared on the Mac runner (yt-dlp) and stored in AGENTS KV.
 * The public player is a native <video> — never a YouTube iframe — so iOS
 * cannot paint pause / title chrome. Not an open YouTube proxy: only the
 * clip the runner wrote for that video id is served.
 */

export const AMBIENT_META_KEY = "ambient:meta";
export const AMBIENT_CLIP_PREFIX = "ambient:clip:";
export const AMBIENT_MAX_BYTES = 12 * 1024 * 1024;
export const AMBIENT_TTL_SEC = 60 * 60 * 24 * 4;

export type AmbientMeta = {
  videoId: string;
  contentType: string;
  byteLength: number;
  preparedAt: string;
};

export function isVideoId(id: string): boolean {
  return /^[\w-]{11}$/.test(id);
}

export function clipKey(videoId: string): string {
  return `${AMBIENT_CLIP_PREFIX}${videoId}`;
}

export async function loadAmbientMeta(kv: KVNamespace): Promise<AmbientMeta | null> {
  const raw = await kv.get(AMBIENT_META_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as AmbientMeta;
    return v && isVideoId(v.videoId) ? v : null;
  } catch {
    return null;
  }
}

export async function loadAmbientClip(
  kv: KVNamespace,
  videoId: string
): Promise<{ buf: ArrayBuffer; contentType: string } | null> {
  if (!isVideoId(videoId)) return null;
  const buf = await kv.get(clipKey(videoId), "arrayBuffer");
  if (!buf || buf.byteLength < 64) return null;
  return { buf, contentType: "video/mp4" };
}

export async function storeAmbientClip(
  kv: KVNamespace,
  videoId: string,
  buf: ArrayBuffer,
  contentType = "video/mp4"
): Promise<AmbientMeta> {
  const meta: AmbientMeta = {
    videoId,
    contentType,
    byteLength: buf.byteLength,
    preparedAt: new Date().toISOString(),
  };
  await kv.put(clipKey(videoId), buf, { expirationTtl: AMBIENT_TTL_SEC });
  await kv.put(AMBIENT_META_KEY, JSON.stringify(meta), { expirationTtl: AMBIENT_TTL_SEC });
  return meta;
}

export function videoBytesResponse(
  buf: ArrayBuffer,
  contentType: string,
  request: Request
): Response {
  const bytes = new Uint8Array(buf);
  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    "X-Content-Type-Options": "nosniff",
  });

  const range = request.headers.get("Range");
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), bytes.length - 1) : bytes.length - 1;
    if (start > end || start >= bytes.length) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${bytes.length}` },
      });
    }
    const slice = bytes.subarray(start, end + 1);
    headers.set("Content-Length", String(slice.length));
    headers.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
    return new Response(slice, { status: 206, headers });
  }

  headers.set("Content-Length", String(bytes.length));
  return new Response(bytes, { status: 200, headers });
}
