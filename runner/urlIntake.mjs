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

  for (const url of batch) {
    const videoId = extractVideoId(url);
    if (!videoId) {
      done.push(url); // not a usable URL — drop it
      continue;
    }
    const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let transcript = null;
    try {
      transcript = await fetchTranscript(videoId);
    } catch {
      /* fall back to web-search-only */
    }
    try {
      const report = await generateBroadcastReport(xaiKey, {
        transcript: transcript || undefined,
        sourceUrl,
      });
      report.citations = await validateCitations(report.citations);
      const out = await submitDraft({
        agentId: "url-intake",
        sourceUrl,
        report,
        source: { transcriptUsed: !!transcript },
      });
      if (out.ok) drafted++;
      // Drop from the queue whether drafted or rejected as a duplicate (409);
      // only a hard generation failure (caught below) leaves nothing to retry.
      done.push(url);
    } catch (err) {
      // Generation failed — drop it too, so a bad URL can't wedge the queue.
      log(`url-intake failed for ${videoId}: ${String(err?.message || err).slice(0, 120)}`);
      done.push(url);
    }
  }

  if (done.length) await removeUrls(done);
  if (drafted) log(`url-intake: drafted ${drafted} of ${batch.length} queued URLs`);
}
