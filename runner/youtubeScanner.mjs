import { generateBroadcastReport } from "../src/lib/broadcast.ts";
import { validateCitations } from "../src/lib/citations.ts";
import { xaiLimits } from "../src/lib/xaiEconomy.ts";
import {
  YOUTUBE_SCANNER_CHANNEL_IDS,
  GOOD_NEWS_POSITIVE_PATTERN,
  GOOD_NEWS_NEGATIVE_PATTERN,
} from "../src/lib/youtubeScannerPolicy.ts";
import { fetchTranscript } from "./transcript.mjs";
import { getKnown, submitDraft } from "./api.mjs";
import { heuristicLighthearted } from "./newsroom.mjs";
import { checkVideosPublic } from "./youtubeVideoStatus.mjs";

// Patterns live in youtubeScannerPolicy.ts (shared with the admin review page).
const GOOD_NEWS = new RegExp(GOOD_NEWS_POSITIVE_PATTERN, "i");
const GOOD_NEWS_NEGATIVE = new RegExp(GOOD_NEWS_NEGATIVE_PATTERN, "i");

function looksLikeGoodNews(title) {
  if (!title) return false;
  return (
    heuristicLighthearted({ headline: title, topics: [] }) &&
    GOOD_NEWS.test(title) &&
    !GOOD_NEWS_NEGATIVE.test(title)
  );
}

// Pull each outlet's latest uploads via its uploads playlist — 1 quota unit per
// call, vs 100 per keyword search. Topic-driven discovery is manual via URL
// intake / Dispatch; this agent only watches the established news outlets.
const YT_PLAYLIST = "https://www.googleapis.com/youtube/v3/playlistItems";

// Channel allow-list: src/lib/youtubeScannerPolicy.ts (also shown in admin).
const NETWORK_CHANNEL_IDS = YOUTUBE_SCANNER_CHANNEL_IDS;

// Run one scan: gather the newest headlines across the news outlets, then draft
// the most-recent transcribed ones (up to maxPublishesPerRun).
export async function runYoutubeScanner(agent) {
  const key = process.env.YOUTUBE_API_KEY;
  const xaiKey = process.env.XAI_API_KEY;
  if (!key) return { ok: false, message: "YOUTUBE_API_KEY not set" };
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY not set" };

  const c = agent.config || {};
  const econ = xaiLimits();
  // Economy caps always win — dial full via XAI_ECONOMY=full.
  const limit = Math.min(
    Number(c.maxPublishesPerRun) || econ.youtubeMaxPublishesPerRun,
    econ.youtubeMaxPublishesPerRun
  );
  const withinHours = c.publishedWithinHours || 48;
  const cutoff = Date.now() - withinHours * 3600_000;
  const perChannel = Math.min(Number(c.perChannel) || 4, 3); // newest uploads per outlet
  // Per-run draft slots reserved for positive/uplifting "good news" headlines so
  // they get surfaced for the Good News page instead of being crowded out by the
  // newest breaking (usually political) stories. 0 disables the reservation.
  const goodNewsSlots = Math.min(c.goodNewsSlots ?? 1, Math.max(0, limit));

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
        goodNews: looksLikeGoodNews(s.title || ""),
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
  let deadVideo = 0;
  let qualityRejected = 0;
  let goodNewsDrafted = 0;

  // 4) Drafting order: reserve the first `goodNewsSlots` attempts for positive /
  // uplifting headlines (newest-first), then fall back to pure recency. Both
  // lists stay newest-first, and dedup keeps anything from being attempted
  // twice — so good news gets a foot in the door without starving the headlines.
  const goodFirst = goodNewsSlots > 0 ? fresh.filter((v) => v.goodNews).slice(0, goodNewsSlots) : [];
  const goodIds = new Set(goodFirst.map((v) => v.videoId));
  const order = [...goodFirst, ...fresh.filter((v) => !goodIds.has(v.videoId))];

  // Track C: batch-check embeddability before burning Grok on dead videos.
  const statusById = await checkVideosPublic(order.map((v) => v.videoId));

  // Transcript-required: draft headlines up to the limit, good news prioritized.
  for (const v of order) {
    if (submitted >= limit) break;
    const live = statusById.get(v.videoId);
    if (live && live.ok === false) {
      deadVideo++;
      skipped++;
      continue;
    }
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
    if (out.ok) {
      submitted++;
      if (v.goodNews) goodNewsDrafted++;
    } else {
      skipped++;
      if (out.body?.reason === "quality-gate") qualityRejected++;
    }
  }

  const goodNewsFresh = fresh.filter((v) => v.goodNews).length;
  return {
    ok: true,
    message: `${candidates.length} recent outlet headlines, ${submitted} drafted (${goodNewsDrafted} good news of ${goodNewsFresh} candidates), ${skipped} skipped (${noTranscript} no transcript, ${deadVideo} dead video, ${qualityRejected} quality-gate)`,
    submitted,
    skipped,
  };
}
