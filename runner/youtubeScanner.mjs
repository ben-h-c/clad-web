import { generateBroadcastReport } from "../src/lib/broadcast.ts";
import { fetchTranscript } from "./transcript.mjs";
import { getKnown, submitDraft } from "./api.mjs";

const YT_API = "https://www.googleapis.com/youtube/v3/search";

// Allow-list of popular US English news networks, by exact YouTube channel ID.
// Using IDs (not title substrings) keeps out foreign affiliates that share a
// name — e.g. US "CNN" vs India's "CNN-News18". Editorial policy; resolved via
// the YouTube Data API and kept in the runner so it's easy to adjust.
const NETWORK_CHANNEL_IDS = new Set([
  "UCupvZG-5ko_eiXAupbDfxWw", // CNN
  "UCXIJgqnII2ZOINSWNOGFThA", // Fox News
  "UCCXoCcu9Rp7NPbTzIvogpZg", // Fox Business
  "UCaXkIU1QidjPwiAYu6GcHjg", // MSNBC (now "MS NOW")
  "UCBi2mrWuNuyYy4gbM6fU18Q", // ABC News
  "UC8p1vwvWtl6T73JiExfWs1g", // CBS News
  "UCeY0bbntWzzVIaj2z3QigXg", // NBC News
  "UC6ZFN9Tx6xh-skXCuRHCDpQ", // PBS NewsHour
  "UCCjG8NtOig0USdrT5D1FpxQ", // NewsNation
  "UCb--64Gl51jIEVE-GLDAVTg", // C-SPAN
  "UChqUTb7kYRX8-EiaN3XFrSQ", // Reuters
  "UC52X5wxOL_s5yw0dQk7NtgA", // Associated Press
  "UCIALMKvObZNtJ6AmdCLP7Lg", // Bloomberg Television
  "UChirEOpgFCupRAk5etXqPaA", // Bloomberg News
  "UCvJJ_dzjViJCoLf5uKUTwoA", // CNBC
  "UCPWXiRWZ29zrxPFIQT7eHSA", // The Hill
  "UCHd62-u_v4DvJ8TCFtpi4GA", // Washington Post
  "UCK7tptUDHh-RYDsdxO1-5QQ", // The Wall Street Journal
  "UCP6HGa63sBC7-KHtkme-p-g", // USA TODAY
  "UCgjtvMmHXbutALaw9XzRkAg", // POLITICO
  "UCJnS2EsPfv46u1JR8cnD0NA", // NPR
  "UCg40OxZ1GYh3u3jBntB6DLg", // Forbes Breaking News
]);

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
    // Cast a wide net (one search = 100 quota units), then keep only the
    // recognized news networks below.
    maxResults: "50",
    relevanceLanguage: "en",
  });

  const res = await fetch(`${YT_API}?${params}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, message: `YouTube API ${res.status}: ${body.slice(0, 160)}` };
  }
  const data = await res.json();
  const all = (data.items || [])
    .filter((it) => it.id?.videoId)
    .map((it) => ({
      videoId: it.id.videoId,
      title: it.snippet?.title || "",
      channel: it.snippet?.channelTitle || "",
      channelId: it.snippet?.channelId || "",
      publishedAt: it.snippet?.publishedAt || "",
    }));

  // Restrict to the exact US news-network channel IDs.
  const candidates = all.filter((v) => NETWORK_CHANNEL_IDS.has(v.channelId));

  if (candidates.length === 0) {
    return {
      ok: true,
      message: `no network matches among ${all.length} results`,
      submitted: 0,
      skipped: 0,
    };
  }

  // Pre-dedupe against published/pending/seen AND same-network same-story.
  const known = await getKnown(
    agent.id,
    candidates.map((v) => ({ videoId: v.videoId, channel: v.channel, title: v.title }))
  );
  const knownSet = new Set(known.ok ? known.body.known || [] : []);
  const fresh = candidates.filter((v) => !knownSet.has(v.videoId));

  const limit = c.maxPublishesPerRun || 3;
  let submitted = 0;
  let skipped = candidates.length - fresh.length;
  let noTranscript = 0;

  // Walk all fresh candidates until we've drafted `limit` — only videos that
  // actually have a transcript are considered (no web-search fallback).
  for (const v of fresh) {
    if (submitted >= limit) break;
    const sourceUrl = `https://www.youtube.com/watch?v=${v.videoId}`;
    const transcript = await fetchTranscript(v.videoId);
    if (!transcript) {
      noTranscript++;
      skipped++;
      continue;
    }
    let report;
    try {
      report = await generateBroadcastReport(xaiKey, {
        transcript,
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
        transcriptUsed: true,
        publishedAt: v.publishedAt,
      },
    });
    if (out.ok) submitted++;
    else skipped++;
  }

  return {
    ok: true,
    message: `${candidates.length} candidates, ${submitted} drafted, ${skipped} skipped (${noTranscript} had no transcript)`,
    submitted,
    skipped,
  };
}
