import { generateBroadcastReport } from "../src/lib/broadcast.ts";
import { validateCitations } from "../src/lib/citations.ts";
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

  const limit = c.maxPublishesPerRun || 3;
  const maxPages = c.maxScanPages || 4; // limited loop: keep looking across pages

  let submitted = 0;
  let skipped = 0;
  let noTranscript = 0;
  let candidatesSeen = 0;
  let pageToken = "";
  // Network allow-list is optional now — accept any channel with a transcript
  // unless requireNetwork is set.
  const requireNetwork = !!c.requireNetwork;

  // Limited loop: page through results until we've drafted `limit` transcribed
  // reports or exhausted maxPages / results. Videos without captions are skipped
  // and the loop keeps going to the next candidate.
  for (let page = 0; page < maxPages && submitted < limit; page++) {
    const params = new URLSearchParams({
      key,
      part: "snippet",
      type: "video",
      regionCode: c.regionCode || "US",
      videoCategoryId: c.videoCategoryId || "25",
      order: c.order || "viewCount",
      publishedAfter,
      q: c.query || "politics",
      maxResults: "50",
      relevanceLanguage: "en",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${YT_API}?${params}`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (page === 0) return { ok: false, message: `YouTube API ${res.status}: ${body.slice(0, 160)}` };
      break; // first page worked; a later page failed — stop with what we have
    }
    const data = await res.json();
    pageToken = data.nextPageToken || "";

    const networkCands = (data.items || [])
      .filter(
        (it) =>
          it.id?.videoId &&
          (!requireNetwork || NETWORK_CHANNEL_IDS.has(it.snippet?.channelId))
      )
      .map((it) => ({
        videoId: it.id.videoId,
        title: it.snippet?.title || "",
        channel: it.snippet?.channelTitle || "",
        publishedAt: it.snippet?.publishedAt || "",
      }));
    candidatesSeen += networkCands.length;

    if (networkCands.length > 0) {
      // Pre-dedupe against published/pending/seen AND same-channel same-story.
      const known = await getKnown(
        agent.id,
        networkCands.map((v) => ({ videoId: v.videoId, channel: v.channel, title: v.title }))
      );
      const knownSet = new Set(known.ok ? known.body.known || [] : []);
      const fresh = networkCands.filter((v) => !knownSet.has(v.videoId));
      skipped += networkCands.length - fresh.length;

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
        } catch {
          skipped++;
          continue;
        }
        report.citations = await validateCitations(report.citations);
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
    }

    if (!pageToken) break; // no more pages
  }

  return {
    ok: true,
    message: `${candidatesSeen} candidates scanned, ${submitted} drafted, ${skipped} skipped (${noTranscript} had no transcript)`,
    submitted,
    skipped,
  };
}
