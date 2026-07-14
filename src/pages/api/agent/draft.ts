import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import {
  draftId,
  existingVideoIds,
  findDuplicateStory,
  findNearDuplicates,
  getDraft,
  leanSpread,
  markSeen,
  putDraft,
  type PendingDraft,
} from "~/lib/agents";
import { normalizeBroadcast } from "~/lib/broadcast";
import { applyEventTopics, assessDraftQuality } from "~/lib/draftQuality";
import { extractVideoId } from "~/lib/youtube";

export const prerender = false;

// The runner submits a generated report here. We dedupe (already published or
// already pending), re-normalize defensively, run quality gates, and store as
// a pending draft (or 400 on hard quality failures).
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
    lean_score: p.report.leanScore,
    lean_rationale: p.report.leanRationale,
    grade_rationale: p.report.gradeRationale,
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

  // Same-network story dedup: a different video from the same channel covering
  // the same story should not be re-posted. (Same topic from a DIFFERENT
  // network is fine — channels are compared, so it won't match.)
  const channel = p?.source?.channel ? String(p.source.channel) : "";
  const videoTitle = p?.source?.videoTitle ? String(p.source.videoTitle) : "";
  const dup = await findDuplicateStory(env.AGENTS, {
    channel,
    texts: [videoTitle, report.headline],
    includeDrafts: true,
    excludeDraftId: id,
  });
  if (dup) {
    await markSeen(env.AGENTS, videoId);
    return json({ ok: false, reason: "duplicate-story", detail: dup }, 409);
  }

  // Cross-network near-dup check: same story from ANY channel within 48h.
  // Never rejects — stored on the draft so the queue can warn the editor.
  const nearDups = await findNearDuplicates(env.AGENTS, {
    texts: [videoTitle, report.headline],
    publishedAt: p?.source?.publishedAt ? String(p.source.publishedAt) : undefined,
    excludeDraftId: id,
  });
  if (nearDups.length > 0) {
    console.warn(
      JSON.stringify({
        evt: "near-dup-cluster",
        videoId,
        channel,
        matches: nearDups.map((m) => ({ id: m.id, lean: m.leanScore })),
        candidateLean: report.leanScore,
        leanSpread: leanSpread([...nearDups, { leanScore: report.leanScore }]),
      })
    );
  }

  const quality = assessDraftQuality(report, { videoTitle, channel });
  if (quality.errors.length > 0) {
    // Mark seen so a broken thin draft doesn't burn quota every hour.
    await markSeen(env.AGENTS, videoId);
    return json(
      {
        ok: false,
        reason: "quality-gate",
        errors: quality.errors,
        warnings: quality.warnings,
      },
      400
    );
  }

  // Debate / town-hall topic enrichment for SEO + politician surfaces.
  applyEventTopics(report, quality.eventType);

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
    nearDuplicates: nearDups.length > 0 ? nearDups : undefined,
    quality: {
      score: quality.score,
      warnings: quality.warnings,
      eventType: quality.eventType,
      politicians: quality.politicians,
      headlineLint: quality.headlineLint,
      priority: quality.priority,
    },
  };

  await putDraft(env.AGENTS, draft);
  await markSeen(env.AGENTS, videoId);
  return json({
    ok: true,
    draftId: id,
    quality: { score: quality.score, eventType: quality.eventType, priority: quality.priority },
  }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
