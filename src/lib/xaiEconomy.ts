/**
 * Single dial for xAI / Grok spend.
 *
 * ## How to switch
 *
 *   Full quality / volume (default):
 *     XAI_ECONOMY=full   (or unset)
 *     # aliases: off | 0 | false | high | prod | production
 *
 *   Economy (save money):
 *     XAI_ECONOMY=economy
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
  profileMaxPublishesPerRun: 1,
  profileMaxPoliticiansPerRun: 4,
  profileMaxDraftsPerPolitician: 1,
  sentimentMaxScansPerRun: 2,
  sentimentUseXSearch: false,
  sentimentWebSearchResults: 2,
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
  // ~25k keeps open/close claims without full 100k full-mode cost.
  transcriptMaxChars: 25_000,
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
    // Sentiment is soft chrome — daily is enough in economy.
    "social-sentiment-scanner": 24,
    "calendar-scanner": 12,
    "home-layout-curator": 12,
    "forecast-refresher": 24,
    "today-in-history": 24,
    "human-spotlight": 24,
    "discover-curator": 24,
    "good-news-curator": 24,
    "race-board-auditor": 24,
    "frontpage-curator": 4,
    // Core home strip — keep closer to 15m cron without full mode.
    "breaking-news-curator": 0.5,
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
    raw === "economy" ||
    raw === "on" ||
    raw === "1" ||
    raw === "true" ||
    raw === "low" ||
    raw === "cheap"
  ) {
    return "economy";
  }
  // Default full when unset — 2026-08-15: run at full quality / volume.
  return "full";
}

export function xaiLimits(envEconomy?: string | null): XaiLimitProfile {
  return xaiSpendMode(envEconomy) === "full" ? FULL : ECONOMY;
}

export function isXaiEconomy(envEconomy?: string | null): boolean {
  return xaiSpendMode(envEconomy) === "economy";
}

/** xAI billing / rate-limit failures — should not burn the full economy sleep. */
export function isXaiCreditFailure(message?: string | null): boolean {
  return /xAI\s*(402|403|429)|credits?\s*(exhaust|limit)|insufficient.?credit|quota.?exceeded|rate.?limit|payment.?required|billing|monthly.?limit|spend.?limit/i.test(
    String(message || "")
  );
}

/**
 * Whether an automatic agent tick should run given last run metadata.
 * Manual runNow / --force always bypass (caller decides).
 *
 * Credit/quota failures allow retry after 15 minutes instead of minHoursBetweenRuns.
 */
export function economyAllowsAgentRun(
  agentKind: string,
  lastRunAt: string | null | undefined,
  now = new Date(),
  envEconomy?: string | null,
  lastRunMeta?: { ok?: boolean; message?: string } | null
): boolean {
  if (xaiSpendMode(envEconomy) === "full") return true;
  if (
    lastRunMeta &&
    lastRunMeta.ok === false &&
    isXaiCreditFailure(lastRunMeta.message)
  ) {
    if (!lastRunAt) return true;
    const t = Date.parse(lastRunAt);
    if (Number.isNaN(t)) return true;
    // Retry soon after credits are restored — don't sleep 12–48h.
    return now.getTime() - t >= 15 * 60_000;
  }
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
    : "xAI spend mode: ECONOMY (throttled — unset or XAI_ECONOMY=full for full volume)";
}
