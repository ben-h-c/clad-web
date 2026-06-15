import { extractVideoId } from "../src/lib/youtube.ts";
import { generateBroadcastReport } from "../src/lib/broadcast.ts";
import { validateCitations } from "../src/lib/citations.ts";
import { fetchTranscript } from "./transcript.mjs";
import { getUrlQueue, removeUrls, submitDraft } from "./api.mjs";

const MAX_PER_TICK = 5;

// Process editor-supplied YouTube URLs (from the admin "Add URLs" page) into
// drafts. Uses yt-dlp for transcripts + web-grounded Grok — NO YouTube Data API
// search, so it bypasses the search-quota limit entirely. Runs every runner tick.
export async function processUrlQueue(log = () => {}) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return;

  const q = await getUrlQueue();
  if (!q.ok || !Array.isArray(q.body?.urls) || q.body.urls.length === 0) return;

  const batch = q.body.urls.slice(0, MAX_PER_TICK);
  const done = [];
  let drafted = 0;
  let noTranscript = 0;

  for (const url of batch) {
    const videoId = extractVideoId(url);
    if (!videoId) {
      done.push(url); // not a usable URL — drop it
      continue;
    }
    const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Transcript required: if the video has no captions, skip it entirely —
    // do NOT fall back to Grok web-search (drop it from the queue).
    let transcript = null;
    try {
      transcript = await fetchTranscript(videoId);
    } catch {
      /* treated as no transcript below */
    }
    if (!transcript) {
      noTranscript++;
      done.push(url);
      continue;
    }

    try {
      const report = await generateBroadcastReport(xaiKey, { transcript, sourceUrl });
      report.citations = await validateCitations(report.citations);
      const out = await submitDraft({
        agentId: "url-intake",
        sourceUrl,
        report,
        source: { transcriptUsed: true },
      });
      if (out.ok) drafted++;
      // Drop whether drafted or rejected as a duplicate (409).
      done.push(url);
    } catch (err) {
      // Generation failed — drop it so a bad URL can't wedge the queue.
      log(`url-intake failed for ${videoId}: ${String(err?.message || err).slice(0, 120)}`);
      done.push(url);
    }
  }

  if (done.length) await removeUrls(done);
  if (drafted || noTranscript) {
    log(`url-intake: drafted ${drafted}, skipped ${noTranscript} (no transcript) of ${batch.length}`);
  }
}
