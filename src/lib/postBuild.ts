/**
 * Builds the markdown frontmatter for a broadcast report. Shared by the manual
 * publish endpoint and the agent approve path so a hand-published post and an
 * agent-approved post are byte-identical in shape.
 */
import type { BroadcastReport } from "./broadcast.ts";
import type { Frontmatter } from "./yaml.ts";
import { tagPoliticiansFromText } from "./politicians.ts";
import { thumbnailUrl } from "./youtube.ts";

export interface BuildOptions {
  sourceUrl: string;
  videoId: string;
  videoTitle?: string;
  sourceTitle?: string; // channel
  featured?: boolean;
  draft?: boolean;
  kicker?: string;
  correctionOf?: string;
  publishedAt?: string; // ISO datetime; defaults to now
  thumbnail?: string; // resolved working thumbnail; falls back to the YouTube still
}

export function buildBroadcastFrontmatter(
  report: BroadcastReport,
  opts: BuildOptions
): Frontmatter {
  const politicians = tagPoliticiansFromText({
    headline: report.headline,
    summary: report.summary,
    assessment: report.assessment,
    topics: report.topics,
    keyMomentClaims: report.keyMoments.map((m) => m.claim),
  });
  return {
    type: "broadcast",
    headline: report.headline,
    kicker: opts.kicker,
    summary: report.summary,
    // Full timestamp (not a bare date): a date-only value parses as UTC
    // midnight, which the Eastern dateline renders as the previous day.
    publishedAt: opts.publishedAt ?? new Date().toISOString(),
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
    thumbnail: opts.thumbnail || thumbnailUrl(opts.videoId),
    citations: report.citations,
    politicians: politicians.length ? politicians : undefined,
  };
}
