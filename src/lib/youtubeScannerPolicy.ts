/**
 * YouTube News Scanner — editorial search criteria (source of truth).
 *
 * The runner (`runner/youtubeScanner.mjs`) imports channel IDs from here so the
 * admin review page and the live agent cannot drift. Read-only documentation
 * of pipeline rules lives alongside the data.
 *
 * To change behavior: edit this file and/or the scanner, then deploy the
 * runner + site. Prefer Grok Build CLI for requestable edits.
 */

export type ScannerChannel = {
  id: string;
  name: string;
  group: "US outlets" | "Talk / panel / commentary" | "International English" | "UK news + commentary";
};

/** Exact YouTube channel IDs (UC…). Uploads playlist = UU + id.slice(2). */
export const YOUTUBE_SCANNER_CHANNELS: ScannerChannel[] = [
  // US outlets
  { id: "UCupvZG-5ko_eiXAupbDfxWw", name: "CNN", group: "US outlets" },
  { id: "UCXIJgqnII2ZOINSWNOGFThA", name: "Fox News", group: "US outlets" },
  { id: "UCCXoCcu9Rp7NPbTzIvogpZg", name: "Fox Business", group: "US outlets" },
  { id: "UCaXkIU1QidjPwiAYu6GcHjg", name: "MSNBC (MS NOW)", group: "US outlets" },
  { id: "UCBi2mrWuNuyYy4gbM6fU18Q", name: "ABC News", group: "US outlets" },
  { id: "UC8p1vwvWtl6T73JiExfWs1g", name: "CBS News", group: "US outlets" },
  { id: "UCeY0bbntWzzVIaj2z3QigXg", name: "NBC News", group: "US outlets" },
  { id: "UC6ZFN9Tx6xh-skXCuRHCDpQ", name: "PBS NewsHour", group: "US outlets" },
  { id: "UCCjG8NtOig0USdrT5D1FpxQ", name: "NewsNation", group: "US outlets" },
  { id: "UCb--64Gl51jIEVE-GLDAVTg", name: "C-SPAN", group: "US outlets" },
  { id: "UChqUTb7kYRX8-EiaN3XFrSQ", name: "Reuters", group: "US outlets" },
  { id: "UC52X5wxOL_s5yw0dQk7NtgA", name: "Associated Press", group: "US outlets" },
  { id: "UCIALMKvObZNtJ6AmdCLP7Lg", name: "Bloomberg Television", group: "US outlets" },
  { id: "UChirEOpgFCupRAk5etXqPaA", name: "Bloomberg News", group: "US outlets" },
  { id: "UCvJJ_dzjViJCoLf5uKUTwoA", name: "CNBC", group: "US outlets" },
  { id: "UCPWXiRWZ29zrxPFIQT7eHSA", name: "The Hill", group: "US outlets" },
  { id: "UCHd62-u_v4DvJ8TCFtpi4GA", name: "Washington Post", group: "US outlets" },
  { id: "UCK7tptUDHh-RYDsdxO1-5QQ", name: "The Wall Street Journal", group: "US outlets" },
  { id: "UCP6HGa63sBC7-KHtkme-p-g", name: "USA TODAY", group: "US outlets" },
  { id: "UCgjtvMmHXbutALaw9XzRkAg", name: "POLITICO", group: "US outlets" },
  { id: "UCJnS2EsPfv46u1JR8cnD0NA", name: "NPR", group: "US outlets" },
  { id: "UCg40OxZ1GYh3u3jBntB6DLg", name: "Forbes Breaking News", group: "US outlets" },
  // Talk / panel / late-night / digital politics (network primetime often
  // already arrives via US outlet channels above; these have their own feeds)
  { id: "UCeH6qE4V7n5tVwP7NkdrtJg", name: "The View", group: "Talk / panel / commentary" },
  { id: "UCwWhs_6x42TyRM4Wstoq8HA", name: "The Daily Show (Jon Stewart)", group: "Talk / panel / commentary" },
  { id: "UC3XTzVzaHQEd30rQbuvCtTQ", name: "Last Week Tonight", group: "Talk / panel / commentary" },
  { id: "UCy6kyFxaMqGtpE3pQTflK8A", name: "Real Time with Bill Maher", group: "Talk / panel / commentary" },
  { id: "UCMtFAi84ehTSYSE9XoHefig", name: "The Late Show with Stephen Colbert", group: "Talk / panel / commentary" },
  { id: "UCVTyTA7-g9nopHeHbeuvpRA", name: "Late Night with Seth Meyers", group: "Talk / panel / commentary" },
  { id: "UCa6vGFO9ty8v5KZJXQxdhaw", name: "Jimmy Kimmel Live", group: "Talk / panel / commentary" },
  { id: "UC1yBKRuGpC1tSM73A0ZjYjQ", name: "The Young Turks", group: "Talk / panel / commentary" },
  { id: "UC9r9HYFxEQOBXSopFS61ZWg", name: "MeidasTouch", group: "Talk / panel / commentary" },
  { id: "UCDRIjKy6eZOvKtOELtTdeUA", name: "Breaking Points", group: "Talk / panel / commentary" },
  { id: "UCzJXNzqz6VMHSNInQt_7q6w", name: "Megyn Kelly", group: "Talk / panel / commentary" },
  { id: "UCnQC_G5Xsjhp9fEJKuIcrSw", name: "Ben Shapiro", group: "Talk / panel / commentary" },
  { id: "UCaeO5vkdj5xOQHp4UmIN6dw", name: "The Daily Wire", group: "Talk / panel / commentary" },
  { id: "UChi08h4577eFsNXGd3sxYhw", name: "Breakfast Club Power 105.1 FM", group: "Talk / panel / commentary" },
  { id: "UCKRoXz3hHAu2XL_k3Ef4vJQ", name: "Pod Save America", group: "Talk / panel / commentary" },
  { id: "UCG4Hp1KbGw4e02N7FpPXDgQ", name: "The Bulwark", group: "Talk / panel / commentary" },
  { id: "UCLwNTXWEjVd2qIHLcXxQWxA", name: "Timcast IRL", group: "Talk / panel / commentary" },
  { id: "UCe02lGcO-ahAURWuxAJnjdA", name: "Timcast", group: "Talk / panel / commentary" },
  { id: "UCldfgbzNILYZA4dmDt4Cd6A", name: "Secular Talk", group: "Talk / panel / commentary" },
  { id: "UCESLZhusAkFfsNsApnjF_Cg", name: "All-In Podcast", group: "Talk / panel / commentary" },
  // International
  { id: "UC16niRr50-MSBwiO3YDb3RA", name: "BBC News", group: "International English" },
  { id: "UCoMdktPbSTixAyNGwb-UYkQ", name: "Sky News", group: "International English" },
  { id: "UCIRYBXDze5krPDzAEOxFGVA", name: "Guardian News", group: "International English" },
  { id: "UCNye-wNBqNL5ZzHSJj3l8Bg", name: "Al Jazeera English", group: "International English" },
  { id: "UCknLrEdhRCp1aegoMqRaCZg", name: "DW News", group: "International English" },
  { id: "UCQfwfsi5VrQ8yKZ-UWmAEFg", name: "France 24 English", group: "International English" },
  { id: "UCuFFtHWoLl5fauMMD5Ww2jA", name: "CBC News", group: "International English" },
  { id: "UChLtXXpo4Ge1ReTEboVvTDg", name: "Global News", group: "International English" },
  // UK
  { id: "UCatt7TBjfBkiJWx8khav_Gg", name: "Piers Morgan Uncensored", group: "UK news + commentary" },
  { id: "UC0vn8ISa4LKMunLbzaXLnOQ", name: "GB News", group: "UK news + commentary" },
  { id: "UCm0yTweyAa0PwEIp0l3N_gA", name: "TalkTV", group: "UK news + commentary" },
  { id: "UCPgLNge0xqQHWM5B5EFH9Cg", name: "The Telegraph", group: "UK news + commentary" },
  { id: "UCTrQ7HXWRRxr7OsOtodr2_w", name: "Channel 4 News", group: "UK news + commentary" },
  { id: "UCIzXayRP7-P0ANpq-nD-h5g", name: "The Sun", group: "UK news + commentary" },
  { id: "UCFQgi22Ht00CpaOQLtvZx2A", name: "ITV News", group: "UK news + commentary" },
];

/** Channel IDs only — used by the runner. */
export const YOUTUBE_SCANNER_CHANNEL_IDS: string[] = YOUTUBE_SCANNER_CHANNELS.map((c) => c.id);

/**
 * Good-news title signals (positive). Headline must also pass
 * `heuristicLighthearted` (not heavy politics / tragedy) and must not match
 * GOOD_NEWS_NEGATIVE.
 */
export const GOOD_NEWS_POSITIVE_PATTERN =
  String.raw`\b(?:breakthrough|discover\w*|cure\w*|rescue\w*|saved|survivors?|record(?:-breaking)?|milestone|historic|first ever|first-ever|wins?|won|victor\w*|champion\w*|triumph\w*|celebrat\w*|reunit\w*|restor\w*|recover\w*|comeback|heartwarming|uplifting|kindness|generou\w*|donat\w*|charity|award\w*|honou?red|achievement|thriv\w*|revive\w*|soars?|lands?|landing|launch\w*|unveil\w*|debut\w*|hope\w*|inspir\w*|miracle\w*)\b`;

/** Good-news exclusions even when a positive word is present. */
export const GOOD_NEWS_NEGATIVE_PATTERN =
  String.raw`\b(?:selloff|sell-off|tumbl\w*|plung\w*|slump\w*|layoff\w*|job cuts|recall\w*|lawsuit\w*|guilty|\bban\b|bans\b|banned|suspend\w*|penalt\w*|warn\w*|shortage\w*|hike\w*|slash\w*|slam\w*|criticiz\w*|criticis\w*|controvers\w*|backlash|feud\w*|scandal|probe|resign\w*|boycott\w*|strike\w*|breach\w*|hack\w*|fraud\w*|bankrupt\w*|heat ?wave\w*|drought\w*|foreclosur\w*)\b`;

export type PipelineStep = {
  n: number;
  title: string;
  detail: string;
};

export type PolicyKnob = {
  key: string;
  value: string;
  source: string;
  notes: string;
};

export type YoutubeScannerPolicyDoc = {
  summary: string;
  notUsed: string[];
  knobs: PolicyKnob[];
  pipeline: PipelineStep[];
  channelGroups: { group: string; channels: ScannerChannel[] }[];
  goodNews: {
    how: string;
    positivePattern: string;
    negativePattern: string;
    lightheartedNote: string;
  };
  draftingGates: string[];
  sourceFiles: { path: string; role: string }[];
};

export function buildYoutubeScannerPolicyDoc(opts?: {
  /** Live agent.config from KV registry, if available */
  agentConfig?: Record<string, unknown> | null;
  economyMode?: string;
  economyPublishCap?: number;
}): YoutubeScannerPolicyDoc {
  const c = opts?.agentConfig ?? {};
  const withinHours = Number(c.publishedWithinHours) || 48;
  const perChannelRaw = Number(c.perChannel) || 4;
  const perChannel = Math.min(perChannelRaw, 3);
  const configPublish = Number(c.maxPublishesPerRun);
  const econCap = opts?.economyPublishCap;
  const publishLimit =
    econCap != null
      ? Math.min(configPublish || econCap, econCap)
      : configPublish || 3;
  const goodNewsSlots = Math.min(
    c.goodNewsSlots != null ? Number(c.goodNewsSlots) : 1,
    Math.max(0, publishLimit)
  );

  const groups = ["US outlets", "Talk / panel / commentary", "International English", "UK news + commentary"] as const;
  const channelGroups = groups.map((group) => ({
    group,
    channels: YOUTUBE_SCANNER_CHANNELS.filter((ch) => ch.group === group),
  }));

  return {
    summary:
      "The YouTube News Scanner does not run keyword search. It watches the uploads playlist of an allow-listed set of news and commentary channels, keeps only recent videos, drops already-seen IDs, requires a transcript, checks the video is still public, then drafts a graded report with Grok (up to a per-run cap). Topic-driven discovery is separate: manual URL intake / Dispatch.",
    notUsed: [
      "YouTube Data API search.list / keyword queries (legacy registry fields like config.query are ignored by the current scanner)",
      "videoCategoryIds (e.g. News & Politics 25) — not used for playlist discovery",
      "regionCode / order / maxScanPages — leftover seed config from the old search-based scanner",
      "Keyword “Categories” admin catalog (removed; was unused)",
    ],
    knobs: [
      {
        key: "Discovery method",
        value: "playlistItems on each channel’s uploads playlist (UC… → UU…)",
        source: "code",
        notes: "1 quota unit per channel call vs ~100 for search",
      },
      {
        key: "Channel allow-list",
        value: `${YOUTUBE_SCANNER_CHANNELS.length} channels (exact channel IDs)`,
        source: "src/lib/youtubeScannerPolicy.ts",
        notes: "IDs avoid foreign affiliates that share a brand name",
      },
      {
        key: "publishedWithinHours",
        value: `${withinHours} hours`,
        source: "agent.config.publishedWithinHours || 48",
        notes: "Videos older than this window are dropped",
      },
      {
        key: "perChannel",
        value: `${perChannel} newest uploads per outlet (raw default ${perChannelRaw}, hard cap 3)`,
        source: "Math.min(config.perChannel || 4, 3)",
        notes: "Always ≤ 3 regardless of higher config",
      },
      {
        key: "maxPublishesPerRun",
        value: String(publishLimit),
        source:
          opts?.economyPublishCap != null
            ? `min(agent.config, xaiEconomy.youtubeMaxPublishesPerRun=${opts.economyPublishCap}) · mode=${opts.economyMode ?? "economy"}`
            : "agent.config + xaiEconomy ceiling",
        notes: "Max drafts submitted this run after all filters",
      },
      {
        key: "goodNewsSlots",
        value: String(goodNewsSlots),
        source: "agent.config.goodNewsSlots ?? 1 (capped by publish limit)",
        notes: "First N drafting attempts reserved for good-news-flagged titles",
      },
      {
        key: "Seed cron",
        value: "0 */2 * * * (every 2 hours)",
        source: "DEFAULT_REGISTRY youtube-news-scanner",
        notes: "Economy minHoursBetweenRuns may further space automatic runs",
      },
      {
        key: "Required env",
        value: "YOUTUBE_API_KEY, XAI_API_KEY",
        source: "runner environment",
        notes: "Missing either aborts the run",
      },
    ],
    pipeline: [
      {
        n: 1,
        title: "Pull uploads per allow-listed channel",
        detail:
          "For each channel ID, request playlistItems on the uploads playlist (UU + channelId without UC). Take up to perChannel newest items with snippet metadata.",
      },
      {
        n: 2,
        title: "Recency filter",
        detail: `Drop videos whose publishedAt is older than publishedWithinHours (${withinHours}h).`,
      },
      {
        n: 3,
        title: "Tag good-news candidates",
        detail:
          "Title-only: heuristicLighthearted (not heavy politics/tragedy) AND positive good-news regex AND not negative good-news regex.",
      },
      {
        n: 4,
        title: "Sort newest first",
        detail: "Across all outlets, order candidates by publishedAt descending.",
      },
      {
        n: 5,
        title: "Dedup against known / pending / published",
        detail:
          "Call getKnown(agentId, candidates). Drop videoIds already seen so the same clip is not drafted twice.",
      },
      {
        n: 6,
        title: "Drafting order",
        detail: `Take up to goodNewsSlots (${goodNewsSlots}) newest good-news titles first, then remaining fresh videos newest-first.`,
      },
      {
        n: 7,
        title: "Public / embeddable check",
        detail:
          "Batch checkVideosPublic before Grok. Private, deleted, or non-embeddable videos are skipped (dead video).",
      },
      {
        n: 8,
        title: "Transcript required",
        detail:
          "fetchTranscript(videoId). No usable transcript → skip (noTranscript). No draft without transcript.",
      },
      {
        n: 9,
        title: "Generate report + citations",
        detail:
          "generateBroadcastReport(Grok) with transcript, source URL, title, channel; then validateCitations.",
      },
      {
        n: 10,
        title: "Submit draft",
        detail:
          "submitDraft to the pending queue. Quality-gate rejections count as skipped. Stop when submitted reaches maxPublishesPerRun.",
      },
    ],
    channelGroups,
    goodNews: {
      how: "Used only to reserve drafting slots so uplifting stories are not crowded out by pure recency. Final Good News page grouping is done later by the Good News Curator on published, classifier-screened reports.",
      positivePattern: GOOD_NEWS_POSITIVE_PATTERN,
      negativePattern: GOOD_NEWS_NEGATIVE_PATTERN,
      lightheartedNote:
        "heuristicLighthearted (runner/newsroom.mjs): title must not match heavy-politics or tragedy heuristics used for the Front Page “cool stories” feed.",
    },
    draftingGates: [
      "On the allow-listed channel set",
      `Published within the last ${withinHours} hours`,
      "Not already known / pending / published for this agent",
      "Video still public / checkVideosPublic ok",
      "Transcript available via yt-dlp / transcript helper",
      "Grok draft succeeds",
      "Not rejected by submit quality-gate",
      `Within maxPublishesPerRun (${publishLimit}) after prioritization`,
    ],
    sourceFiles: [
      { path: "src/lib/youtubeScannerPolicy.ts", role: "Channel list + this documentation (source of truth)" },
      { path: "runner/youtubeScanner.mjs", role: "Live scan pipeline" },
      { path: "runner/newsroom.mjs", role: "heuristicLighthearted for good-news prefilter" },
      { path: "runner/transcript.mjs", role: "Transcript fetch" },
      { path: "runner/youtubeVideoStatus.mjs", role: "Public / dead video check" },
      { path: "src/lib/broadcast.ts", role: "Grok report generation" },
      { path: "src/lib/xaiEconomy.ts", role: "Economy vs full publish caps" },
      { path: "src/lib/agents.ts", role: "Agent registry seed (cron + config; some fields legacy)" },
    ],
  };
}
