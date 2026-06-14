import { generateBroadcastReport } from "../src/lib/broadcast.ts";
import { fetchTranscript } from "./transcript.mjs";
import { getKnown, submitDraft } from "./api.mjs";

const YT_API = "https://www.googleapis.com/youtube/v3/search";

// Run one scan for a youtube-scanner agent. Returns a status summary.
export async function runYoutubeScanner(agent) {
  const key = process.env.YOUTUBE_API_KEY;
  const xaiKey = process.env.XAI_API_KEY;
  if (!key) return { ok: false, message: "YOUTUBE_API_KEY not set" };
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY not set" };

  const c = agent.config;
  const publishedAfter = new Date(
    Date.now() - (c.publishedWithinHours || 24) * 3600_000
  ).toISOString();

  const params = new URLSearchParams({
    key,
    part: "snippet",
    type: "video",
    regionCode: c.regionCode || "US",
    videoCategoryId: c.videoCategoryId || "25",
    order: c.order || "viewCount",
    publishedAfter,
    q: c.query || "politics",
    maxResults: String(c.maxCandidatesPerRun || 8),
    relevanceLanguage: "en",
  });

  const res = await fetch(`${YT_API}?${params}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, message: `YouTube API ${res.status}: ${body.slice(0, 160)}` };
  }
  const data = await res.json();
  const candidates = (data.items || [])
    .filter((it) => it.id?.videoId)
    .map((it) => ({
      videoId: it.id.videoId,
      title: it.snippet?.title || "",
      channel: it.snippet?.channelTitle || "",
      publishedAt: it.snippet?.publishedAt || "",
    }));

  if (candidates.length === 0) return { ok: true, message: "no candidates", submitted: 0, skipped: 0 };

  // Pre-dedupe against published/pending/seen.
  const known = await getKnown(agent.id, candidates.map((v) => v.videoId));
  const knownSet = new Set(known.ok ? known.body.known || [] : []);
  const fresh = candidates.filter((v) => !knownSet.has(v.videoId));

  const limit = c.maxPublishesPerRun || 3;
  let submitted = 0;
  let skipped = candidates.length - fresh.length;

  for (const v of fresh.slice(0, limit)) {
    const sourceUrl = `https://www.youtube.com/watch?v=${v.videoId}`;
    const transcript = await fetchTranscript(v.videoId);
    let report;
    try {
      report = await generateBroadcastReport(xaiKey, {
        transcript: transcript || undefined,
        sourceUrl,
        videoTitle: v.title,
        channel: v.channel,
      });
    } catch (err) {
      skipped++;
      continue;
    }

    const out = await submitDraft({
      agentId: agent.id,
      sourceUrl,
      report,
      source: {
        channel: v.channel,
        videoTitle: v.title,
        transcriptUsed: Boolean(transcript),
        publishedAt: v.publishedAt,
      },
    });
    if (out.ok) submitted++;
    else skipped++;
  }

  return {
    ok: true,
    message: `${candidates.length} candidates, ${submitted} drafted, ${skipped} skipped`,
    submitted,
    skipped,
  };
}
