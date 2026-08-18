import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isVideoId, loadAmbientClip, videoBytesResponse } from "~/lib/ambientClip";

export const prerender = false;

/**
 * Public Cover-lead clip. Same-origin so <video autoplay muted playsinline>
 * can loop without YouTube's player chrome. 404 keeps the still visible.
 */
export const GET: APIRoute = async ({ request, params }) => {
  const videoId = params.videoId ?? "";
  if (!isVideoId(videoId)) return notFound();
  const clip = await loadAmbientClip(env.AGENTS, videoId);
  if (!clip) return notFound();
  return videoBytesResponse(clip.buf, clip.contentType, request);
};

export const HEAD: APIRoute = async ({ params }) => {
  const videoId = params.videoId ?? "";
  if (!isVideoId(videoId)) return notFound();
  const clip = await loadAmbientClip(env.AGENTS, videoId);
  if (!clip) return notFound();
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": clip.contentType,
      "Content-Length": String(clip.buf.byteLength),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
};

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}
