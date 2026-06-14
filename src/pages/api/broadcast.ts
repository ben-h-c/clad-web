import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { generateBroadcastReport } from "~/lib/broadcast";
import { extractVideoId } from "~/lib/youtube";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!env.XAI_API_KEY) return json({ error: "XAI_API_KEY not configured" }, 503);

  // One editor, one bucket — shared with /api/factcheck. Backstop for a
  // leaked credential so the xAI bill can't run away.
  if (env.FACTCHECK_LIMITER) {
    const { success } = await env.FACTCHECK_LIMITER.limit({ key: "factcheck" });
    if (!success) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again in a minute." }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } }
      );
    }
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const youtubeUrl = String(payload?.youtubeUrl ?? "").trim();
  const transcript = String(payload?.transcript ?? "").trim();
  const videoTitle = payload?.videoTitle ? String(payload.videoTitle).trim() : undefined;
  const channel = payload?.channel ? String(payload.channel).trim() : undefined;
  const notes = payload?.notes ? String(payload.notes).trim() : undefined;

  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) return json({ error: "Not a valid YouTube URL" }, 400);
  if (transcript.length < 80) return json({ error: "Transcript too short — paste the full transcript" }, 400);
  if (transcript.length > 200_000) return json({ error: "Transcript too long" }, 400);

  try {
    const report = await generateBroadcastReport(env.XAI_API_KEY, {
      transcript,
      sourceUrl: youtubeUrl,
      videoTitle,
      channel,
      notes,
    });
    return json({ ...report, videoId }, 200);
  } catch (err: any) {
    return json({ error: err?.message ?? "Report generation failed" }, 502);
  }
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
