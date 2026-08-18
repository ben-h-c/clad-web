import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import {
  AMBIENT_MAX_BYTES,
  isVideoId,
  loadAmbientMeta,
  storeAmbientClip,
} from "~/lib/ambientClip";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const meta = await loadAmbientMeta(env.AGENTS);
  return json({ ok: true, meta }, 200);
};

/** Runner uploads a short muted H264 clip of the current Cover lead. */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const videoId = (request.headers.get("x-ambient-video-id") || "").trim();
  if (!isVideoId(videoId)) {
    return json({ error: "invalid video id" }, 400);
  }
  const buf = await request.arrayBuffer();
  if (buf.byteLength < 256) return json({ error: "clip too small" }, 400);
  if (buf.byteLength > AMBIENT_MAX_BYTES) return json({ error: "clip too large" }, 413);
  const type = request.headers.get("content-type") || "video/mp4";
  if (!/^video\/(mp4|webm|quicktime)/i.test(type)) {
    return json({ error: "expected video/* body" }, 415);
  }
  const meta = await storeAmbientClip(env.AGENTS, videoId, buf, "video/mp4");
  return json({ ok: true, meta }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
