import { generateBroadcastReport } from "../src/lib/broadcast.ts";
import { validateCitations } from "../src/lib/citations.ts";
import { fetchTranscript } from "./transcript.mjs";
import { getKnown, submitDraft } from "./api.mjs";

// Pull each outlet's latest uploads via its uploads playlist — 1 quota unit per
// call, vs 100 per keyword search. (Topic-driven discovery is now handled
// manually via the Categories page + Dispatch; this agent only watches the
// established news outlets for their newest headlines.)
const YT_PLAYLIST = "https://www.googleapis.com/youtube/v3/playlistItems";

// Allow-list of US English news outlets + talk/panel/commentary shows, by exact
// YouTube channel ID (the Front Page features talk-show segments). Using IDs
// (not title substrings) keeps out foreign affiliates that share a name — e.g.
// US "CNN" vs India's "CNN-News18". Editorial policy; easy to adjust here.
const NETWORK_CHANNEL_IDS = [
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
  // Talk shows / panels / roundtables / late-night political (their own
  // channels — the networks above also upload their panel shows: Fox & Friends,
  // The Five, Morning Joe, Meet the Press, etc.).
  "UCeH6qE4V7n5tVwP7NkdrtJg", // The View
  "UCwWhs_6x42TyRM4Wstoq8HA", // The Daily Show (Jon Stewart)
  "UC3XTzVzaHQEd30rQbuvCtTQ", // Last Week Tonight
  "UCy6kyFxaMqGtpE3pQTflK8A", // Real Time with Bill Maher
];

// Run one scan: gather the newest headlines across the news outlets, then draft
// the most-recent transcribed ones (up to maxPublishesPerRun).
export async function runYoutubeScanner(agent) {
  const key = process.env.YOUTUBE_API_KEY;
  const xaiKey = process.env.XAI_API_KEY;
  if (!key) return { ok: false, message: "YOUTUBE_API_KEY not set" };
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY not set" };

  const c = agent.config || {};
  const limit = c.maxPublishesPerRun || 3;
  const withinHours = c.publishedWithinHours || 48;
  const cutoff = Date.now() - withinHours * 3600_000;
  const perChannel = c.perChannel || 4; // newest uploads to pull from each outlet

  // 1) Collect recent uploads from every outlet's uploads playlist (UC… -> UU…).
  const candidates = [];
  let firstError = null;
  for (const channelId of NETWORK_CHANNEL_IDS) {
    const uploadsId = "UU" + channelId.slice(2);
    const params = new URLSearchParams({
      key,
      part: "snippet",
      playlistId: uploadsId,
      maxResults: String(perChannel),
    });
    let res;
    try {
      res = await fetch(`${YT_PLAYLIST}?${params}`);
    } catch {
      continue;
    }
    if (!res.ok) {
      if (!firstError) firstError = `${res.status}: ${(await res.text().catch(() => "")).slice(0, 140)}`;
      continue;
    }
    const data = await res.json();
    for (const it of data.items || []) {
      const s = it.snippet || {};
      const videoId = s.resourceId?.videoId;
      if (!videoId) continue;
      const publishedAt = s.publishedAt || "";
      if (publishedAt && new Date(publishedAt).getTime() < cutoff) continue; // outside the window
      candidates.push({
        videoId,
        title: s.title || "",
        channel: s.videoOwnerChannelTitle || s.channelTitle || "",
        publishedAt,
      });
    }
  }

  if (candidates.length === 0) {
    return {
      ok: !firstError,
      message: firstError ? `YouTube API ${firstError}` : `no outlet uploads in the last ${withinHours}h`,
      submitted: 0,
      skipped: 0,
    };
  }

  // 2) Most-recent first across all outlets = the top current headlines.
  candidates.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // 3) Drop anything already published/pending/seen.
  const known = await getKnown(
    agent.id,
    candidates.map((v) => ({ videoId: v.videoId, channel: v.channel, title: v.title }))
  );
  const knownSet = new Set(known.ok ? known.body.known || [] : []);
  const fresh = candidates.filter((v) => !knownSet.has(v.videoId));

  let submitted = 0;
  let skipped = candidates.length - fresh.length;
  let noTranscript = 0;

  // 4) Transcript-required: draft the newest fresh headlines up to the limit.
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

  return {
    ok: true,
    message: `${candidates.length} recent outlet headlines, ${submitted} drafted, ${skipped} skipped (${noTranscript} no transcript)`,
    submitted,
    skipped,
  };
}
