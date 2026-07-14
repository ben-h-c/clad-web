/**
 * Editorial QA for agent drafts before they hit the approval queue.
 *
 * Hard fails → reject at /api/agent/draft (runner skips).
 * Soft warnings → stored on the draft for the queue UI.
 *
 * Also classifies event type (debate / town hall / …) and attaches politician
 * tags so midterm surfaces stay current without a second model call.
 */
import type { BroadcastReport } from "./broadcast.ts";
import { lintHeadline } from "./headlineLint.ts";
import { tagPoliticiansFromText, type PoliticianTag } from "./politicians.ts";
import { gradeToGpa } from "./topics.ts";

export type EventType =
  | "debate"
  | "town-hall"
  | "presser"
  | "hearing"
  | "interview"
  | "sunday-show"
  | "newscast"
  | "other";

export interface DraftQuality {
  /** 0–100 composite for sorting the queue (higher = cleaner). */
  score: number;
  /** Soft issues — draft is still queued. */
  warnings: string[];
  /** Hard issues — draft endpoint should 400. */
  errors: string[];
  eventType: EventType;
  politicians: PoliticianTag[];
  headlineLint: string[];
  /** True when this looks like a midterm / debate-night priority piece. */
  priority: boolean;
}

const DEBATE =
  /\b(?:debate|debates|debating|debated|town\s*hall|candidate\s+forum|campaign\s+forum|primary\s+debate|general\s+election\s+debate)\b/i;
const TOWN_HALL = /\btown\s*halls?\b/i;
const PRESSER =
  /\b(?:press\s+conference|presser|news\s+conference|stakeout|gaggle|briefing)\b/i;
const HEARING =
  /\b(?:hearing|testimony|testifies|committee|markup|confirmation\s+hearing)\b/i;
const INTERVIEW =
  /\b(?:interview|one[- ]on[- ]one|sits\s+down|exclusive|fireside)\b/i;
const SUNDAY =
  /\b(?:meet\s+the\s+press|face\s+the\s+nation|this\s+week|fox\s+news\s+sunday|state\s+of\s+the\s+union|sunday\s+show|morning\s+joe)\b/i;

export function classifyEventType(parts: {
  headline?: string;
  videoTitle?: string;
  channel?: string;
  summary?: string;
  topics?: string[];
}): EventType {
  const blob = [
    parts.headline,
    parts.videoTitle,
    parts.channel,
    parts.summary,
    ...(parts.topics ?? []),
  ]
    .filter(Boolean)
    .join(" \n ");
  if (DEBATE.test(blob)) return "debate";
  if (TOWN_HALL.test(blob)) return "town-hall";
  if (SUNDAY.test(blob)) return "sunday-show";
  if (PRESSER.test(blob)) return "presser";
  if (HEARING.test(blob)) return "hearing";
  if (INTERVIEW.test(blob)) return "interview";
  if (/\b(?:newscast|evening\s+news|nightly\s+news|world\s+news)\b/i.test(blob)) return "newscast";
  return "other";
}

export function eventTypeLabel(t: EventType): string {
  switch (t) {
    case "debate":
      return "Debate";
    case "town-hall":
      return "Town hall";
    case "presser":
      return "Press conference";
    case "hearing":
      return "Hearing";
    case "interview":
      return "Interview";
    case "sunday-show":
      return "Sunday show";
    case "newscast":
      return "Newscast";
    default:
      return "Segment";
  }
}

/** Ensure debate/town-hall tags surface in topics for SEO + politician pages. */
export function enrichTopicsForEvent(topics: string[], eventType: EventType): string[] {
  const out = [...topics];
  const has = (s: string) => out.some((t) => t.toLowerCase() === s.toLowerCase());
  if (eventType === "debate" && !has("Debate")) out.unshift("Debate");
  if (eventType === "town-hall" && !has("Town hall")) out.unshift("Town hall");
  if (eventType === "sunday-show" && !has("Sunday shows")) out.unshift("Sunday shows");
  // Cap at 4 (schema max).
  return out.slice(0, 4);
}

/**
 * Grade vs factuality sanity: letter GPA and 0–100 score should roughly agree.
 * Large spreads usually mean a confused model output.
 */
function gradeScoreMismatch(letterGrade: string, factuality: number): string | null {
  const gpa = gradeToGpa(letterGrade);
  if (gpa == null || !Number.isFinite(factuality)) return null;
  // Map GPA 0–12 → expected ~ band center.
  const expected = Math.round((gpa / 12) * 100);
  const delta = Math.abs(expected - factuality);
  if (delta >= 35) {
    return `Grade ${letterGrade} vs factuality ${factuality} look inconsistent (expected ~${expected})`;
  }
  return null;
}

export function assessDraftQuality(
  report: BroadcastReport,
  source?: { videoTitle?: string; channel?: string }
): DraftQuality {
  const errors: string[] = [];
  const warnings: string[] = [];

  const headlineLint = lintHeadline(report.headline);
  if (headlineLint.length) {
    warnings.push(`Headline states the verdict (${headlineLint.map((w) => `"${w}"`).join(", ")})`);
  }
  if (report.headline.length > 110) {
    warnings.push(`Headline is long (${report.headline.length} chars) — prefer ≤90`);
  }
  if (report.summary.length < 80) {
    errors.push("Summary too thin for a publishable report");
  } else if (report.summary.length < 160) {
    warnings.push("Summary is short — reader may lack context");
  }
  if (report.assessment.length < 80) {
    errors.push("Assessment too thin");
  }
  if (!report.gradeRationale || report.gradeRationale.length < 20) {
    warnings.push("Missing or thin grade rationale");
  }
  if (!report.leanRationale || report.leanRationale.length < 12) {
    warnings.push("Missing or thin lean rationale");
  }
  if (report.keyMoments.length < 2) {
    errors.push(`Need at least 2 key moments (got ${report.keyMoments.length})`);
  } else if (report.keyMoments.length < 3) {
    warnings.push("Only 2 key moments — prefer 3–5");
  }
  if (report.citations.length < 2) {
    warnings.push(`Sparse citations (${report.citations.length}) — prefer 4+`);
  }
  if (report.topics.length === 0) {
    warnings.push("No topics tagged");
  }
  const mismatch = gradeScoreMismatch(report.letterGrade, report.factualityScore);
  if (mismatch) warnings.push(mismatch);

  // Factuality 50 + grade "could not verify" is a known web-search fallback.
  if (
    report.factualityScore === 50 &&
    /could not be independently verified|could not verify|insufficient information/i.test(
      report.summary + " " + report.assessment
    )
  ) {
    warnings.push("Model flagged uncertainty — verify against the video before approve");
  }

  const eventType = classifyEventType({
    headline: report.headline,
    videoTitle: source?.videoTitle,
    channel: source?.channel,
    summary: report.summary,
    topics: report.topics,
  });

  const politicians = tagPoliticiansFromText({
    headline: report.headline,
    summary: report.summary,
    assessment: report.assessment,
    topics: report.topics,
    keyMomentClaims: report.keyMoments.map((m) => m.claim),
  });

  if (
    (eventType === "debate" || eventType === "town-hall") &&
    politicians.length === 0
  ) {
    warnings.push("Debate/town hall with no matched politicians — check names in the report");
  }

  const priority =
    eventType === "debate" ||
    eventType === "town-hall" ||
    eventType === "sunday-show" ||
    politicians.some((p) =>
      /senate|governor|president|vice/i.test(
        // priority if any top-tier office seed matched — race lives on seed, not tag
        p.name
      )
    );

  // Composite score: start 100, subtract.
  let score = 100;
  score -= errors.length * 25;
  score -= warnings.length * 8;
  score -= headlineLint.length * 5;
  if (report.citations.length >= 4) score += 5;
  if (report.keyMoments.length >= 4) score += 5;
  if (politicians.length > 0) score += 3;
  if (priority) score += 2;
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    warnings,
    errors,
    eventType,
    politicians,
    headlineLint,
    priority,
  };
}

/** Apply event-topic enrichment onto a report (mutates topics array). */
export function applyEventTopics(report: BroadcastReport, eventType: EventType): void {
  report.topics = enrichTopicsForEvent(report.topics, eventType);
}
