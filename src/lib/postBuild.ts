/**
 * Builds the markdown frontmatter for a broadcast report. Shared by the manual
 * publish endpoint and the agent approve path so a hand-published post and an
 * agent-approved post are byte-identical in shape.
 */
import type { BroadcastReport } from "~/lib/broadcast";
import type { Frontmatter } from "~/lib/yaml";
import { thumbnailUrl } from "~/lib/youtube";

export interface BuildOptions {
  sourceUrl: string;
  videoId: string;
  videoTitle?: string;
  sourceTitle?: string; // channel
  featured?: boolean;
  draft?: boolean;
  kicker?: string;
  correctionOf?: string;
  publishedAt?: string; // ISO date; defaults to today (UTC)
}

export function buildBroadcastFrontmatter(
  report: BroadcastReport,
  opts: BuildOptions
): Frontmatter {
  return {
    type: "broadcast",
    headline: report.headline,
    kicker: opts.kicker,
    summary: report.summary,
    publishedAt: opts.publishedAt ?? new Date().toISOString().slice(0, 10),
    sourceUrl: opts.sourceUrl,
    sourceTitle: opts.sourceTitle,
    section: "Politics",
    draft: opts.draft,
    featured: opts.featured,
    correctionOf: opts.correctionOf,
    letterGrade: report.letterGrade,
    factualityScore: report.factualityScore,
    politicalLean: report.politicalLean,
    leanScore: report.leanScore,
    leanRationale: report.leanRationale || undefined,
    gradeRationale: report.gradeRationale || undefined,
    topics: report.topics,
    assessment: report.assessment,
    notableConcerns: report.notableConcerns,
    keyMoments: report.keyMoments,
    videoId: opts.videoId,
    videoTitle: opts.videoTitle,
    thumbnail: thumbnailUrl(opts.videoId),
    citations: report.citations,
  };
}
