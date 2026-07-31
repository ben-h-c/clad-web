/**
 * Single dial for xAI / Grok spend.
 *
 * ## How to switch
 *
 *   Economy (default — save money while traffic is low):
 *     XAI_ECONOMY=economy   (or unset)
 *
 *   Full quality / volume when users grow and freshness matters:
 *     XAI_ECONOMY=full
 *     # aliases: off | 0 | false | high
 *
 * Set on the **runner** host (PM2 / runner/.env) for agents.
 * Optionally set the same secret on the Worker for vision / on-demand paths.
 *
 * Runtime caps always `Math.min(agent.config, economyMax)` so KV can still
 * raise limits later without code changes — but economy mode never exceeds
 * the ceilings below until you flip the switch to full.
 */

export type XaiSpendMode = "economy" | "full";

export type XaiLimitProfile = {
  /** Cap full broadcast drafts (YT scanner). */
  youtubeMaxPublishesPerRun: number;
  youtubeMaxCandidatesPerRun: number;
  /** Cap politician-builder drafts. */
  profileMaxPublishesPerRun: number;
  profileMaxPoliticiansPerRun: number;
  profileMaxDraftsPerPolitician: number;
  /** Sentiment scans per run. */
  sentimentMaxScansPerRun: number;
  sentimentUseXSearch: boolean;
  sentimentWebSearchResults: number;
  /** Politician grader. */
  graderMaxPoliticiansPerRun: number;
  /** Calendar scanner window + density. */
  calendarLookAheadDays: number;
  calendarLookBackDays: number;
  calendarMaxEventsPerRun: number;
  calendarMaxChunksPerRun: number;
  calendarChunkDays: number;
  /** Discover / good-news. */
  discoverPoolSize: number;
  goodNewsPoolSize: number;
  classifyMaxNew: number;
  goodNewsVerifyPass: boolean;
  useReasoningCurators: boolean;
  /** Broadcast generation. */
  transcriptMaxChars: number;
  broadcastWebSearchResults: number;
  /** Prefer cheaper non-reasoning model when transcript is long enough. */
  broadcastPreferCheapModelWithTranscript: boolean;
  cheapBroadcastModel: string;
  premiumBroadcastModel: string;
  /** Vision on publish/approve (bulk already skips). */
  enableVisionOnPublish: boolean;
  /**
   * Min hours between automatic runs for optional agents (economy only).
   * Cron can still fire; runner skips until enough time passed.
   * 0 = honor cron only.
   */
  minHoursBetweenRuns: Record<string, number>;
};

const FULL: XaiLimitProfile = {
  youtubeMaxPublishesPerRun: 15,
  youtubeMaxCandidatesPerRun: 8,
  profileMaxPublishesPerRun: 10,
  profileMaxPoliticiansPerRun: 12,
  profileMaxDraftsPerPolitician: 1,
  sentimentMaxScansPerRun: 10,
  sentimentUseXSearch: true,
  sentimentWebSearchResults: 8,
  graderMaxPoliticiansPerRun: 20,
  calendarLookAheadDays: 60,
  calendarLookBackDays: 21,
  calendarMaxEventsPerRun: 90,
  calendarMaxChunksPerRun: 10,
  calendarChunkDays: 12,
  discoverPoolSize: 80,
  goodNewsPoolSize: 120,
  classifyMaxNew: 50,
  goodNewsVerifyPass: true,
  useReasoningCurators: true,
  transcriptMaxChars: 100_000,
  broadcastWebSearchResults: 6,
  broadcastPreferCheapModelWithTranscript: false,
  cheapBroadcastModel: "grok-4.20-0309-non-reasoning",
  premiumBroadcastModel: "grok-4.3",
  enableVisionOnPublish: true,
  minHoursBetweenRuns: {},
};

/** Aggressive save mode — still produces drafts, just far fewer and lighter. */
const ECONOMY: XaiLimitProfile = {
  youtubeMaxPublishesPerRun: 3,
  youtubeMaxCandidatesPerRun: 5,
  profileMaxPublishesPerRun: 2,
  profileMaxPoliticiansPerRun: 6,
  profileMaxDraftsPerPolitician: 1,
  sentimentMaxScansPerRun: 3,
  sentimentUseXSearch: false,
  sentimentWebSearchResults: 3,
  graderMaxPoliticiansPerRun: 6,
  calendarLookAheadDays: 21,
  calendarLookBackDays: 7,
  calendarMaxEventsPerRun: 30,
  calendarMaxChunksPerRun: 3,
  calendarChunkDays: 14,
  discoverPoolSize: 40,
  goodNewsPoolSize: 40,
  classifyMaxNew: 12,
  goodNewsVerifyPass: false,
  useReasoningCurators: false,
  transcriptMaxChars: 10_000,
  broadcastWebSearchResults: 3,
  broadcastPreferCheapModelWithTranscript: true,
  cheapBroadcastModel: "grok-4.20-0309-non-reasoning",
  premiumBroadcastModel: "grok-4.3",
  enableVisionOnPublish: false,
  // Stretch optional / decorative agents (cron still defines earliest slot).
  minHoursBetweenRuns: {
    "youtube-scanner": 2, // at most ~every 2h even if cron is hourly
    "politician-profile-builder": 6,
    "politician-grader": 12,
    "social-sentiment-scanner": 12,
    "calendar-scanner": 12,
    "home-layout-curator": 12,
    "forecast-refresher": 24,
    "today-in-history": 24,
    "human-spotlight": 24,
    "discover-curator": 24,
    "good-news-curator": 24,
    "race-board-auditor": 48,
    "frontpage-curator": 4,
    "breaking-news-curator": 1,
    "quip-writer": 72,
    "share-tag-writer": 72,
    "compliance-auditor": 168,
  },
};

export function xaiSpendMode(envEconomy?: string | null): XaiSpendMode {
  const raw = String(
    envEconomy ??
      (typeof process !== "undefined" && process.env
        ? process.env.XAI_ECONOMY ?? process.env.XAI_SPEND_MODE ?? ""
        : "") ??
      "economy"
  )
    .trim()
    .toLowerCase();
  if (
    raw === "full" ||
    raw === "off" ||
    raw === "0" ||
    raw === "false" ||
    raw === "high" ||
    raw === "prod" ||
    raw === "production"
  ) {
    return "full";
  }
  // Default economy when unset — intentional while user count is low.
  return "economy";
}

export function xaiLimits(envEconomy?: string | null): XaiLimitProfile {
  return xaiSpendMode(envEconomy) === "full" ? FULL : ECONOMY;
}

export function isXaiEconomy(envEconomy?: string | null): boolean {
  return xaiSpendMode(envEconomy) === "economy";
}

/**
 * Whether an automatic agent tick should run given last success time.
 * Manual runNow / --force always bypass (caller decides).
 */
export function economyAllowsAgentRun(
  agentKind: string,
  lastRunAt: string | null | undefined,
  now = new Date(),
  envEconomy?: string | null
): boolean {
  if (xaiSpendMode(envEconomy) === "full") return true;
  const minH = xaiLimits(envEconomy).minHoursBetweenRuns[agentKind];
  if (!minH || minH <= 0) return true;
  if (!lastRunAt) return true;
  const t = Date.parse(lastRunAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= minH * 3_600_000;
}

/** Truncate transcript for Grok; keep head + tail so open/close claims survive. */
export function clipTranscriptForGrok(
  transcript: string | undefined | null,
  maxChars?: number,
  envEconomy?: string | null
): string {
  const t = String(transcript || "").trim();
  if (!t) return "";
  const max = maxChars ?? xaiLimits(envEconomy).transcriptMaxChars;
  if (t.length <= max) return t;
  const head = Math.floor(max * 0.72);
  const tail = max - head - 80;
  return (
    t.slice(0, head) +
    `\n\n[… transcript truncated for length; ${t.length - max} chars omitted …]\n\n` +
    t.slice(-Math.max(0, tail))
  );
}

export function xaiEconomyBanner(envEconomy?: string | null): string {
  const mode = xaiSpendMode(envEconomy);
  return mode === "full"
    ? "xAI spend mode: FULL (high quality / volume)"
    : "xAI spend mode: ECONOMY (throttled — set XAI_ECONOMY=full to restore)";
}
