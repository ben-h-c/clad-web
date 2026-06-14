import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import {
  draftId,
  existingVideoIds,
  getDraft,
  markSeen,
  putDraft,
  type PendingDraft,
} from "~/lib/agents";
import { normalizeBroadcast } from "~/lib/broadcast";
import { extractVideoId } from "~/lib/youtube";

export const prerender = false;

// The runner submits a generated report here. We dedupe (already published or
// already pending), re-normalize defensively, and store as a pending draft.
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }

  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const agentId = String(p?.agentId ?? "").trim();
  const sourceUrl = String(p?.sourceUrl ?? "").trim();
  const overwrite = Boolean(p?.overwrite);
  const videoId = extractVideoId(sourceUrl);

  if (!agentId) return json({ error: "agentId required" }, 400);
  if (!videoId) return json({ error: "valid YouTube sourceUrl required" }, 400);
  if (!p?.report || typeof p.report !== "object") {
    return json({ error: "report required" }, 400);
  }

  // Dedupe: already published?
  const published = await existingVideoIds();
  if (published.has(videoId)) {
    await markSeen(env.AGENTS, videoId);
    return json({ ok: false, reason: "already-published", videoId }, 409);
  }

  const id = draftId(agentId, videoId);
  if (!overwrite && (await getDraft(env.AGENTS, id))) {
    return json({ ok: false, reason: "already-pending", draftId: id }, 409);
  }

  const report = normalizeBroadcast({
    headline: p.report.headline,
    letter_grade: p.report.letterGrade,
    factuality_score: p.report.factualityScore,
    political_lean: p.report.politicalLean,
    lean_rationale: p.report.leanRationale,
    topics: p.report.topics,
    summary: p.report.summary,
    assessment: p.report.assessment,
    notable_concerns: p.report.notableConcerns,
    key_moments: p.report.keyMoments,
    citations: p.report.citations,
  });

  if (report.headline.length < 4 || report.summary.length < 8) {
    return json({ error: "report missing headline/summary" }, 400);
  }

  const draft: PendingDraft = {
    draftId: id,
    agentId,
    videoId,
    sourceUrl,
    createdAt: new Date().toISOString(),
    source: {
      channel: p?.source?.channel ? String(p.source.channel) : undefined,
      videoTitle: p?.source?.videoTitle ? String(p.source.videoTitle) : undefined,
      transcriptUsed: Boolean(p?.source?.transcriptUsed),
      publishedAt: p?.source?.publishedAt ? String(p.source.publishedAt) : undefined,
    },
    report,
  };

  await putDraft(env.AGENTS, draft);
  await markSeen(env.AGENTS, videoId);
  return json({ ok: true, draftId: id }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
