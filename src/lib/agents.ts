/**
 * Agent state, stored in the AGENTS KV namespace. Three key families:
 *   - `agents:registry`      one JSON object: all agents + their config + lastRun
 *   - `draft:<draftId>`      one pending report awaiting editor approval
 *   - `seen:<videoId>`       dedupe ledger ("1"); written at submit and approve
 *
 * The Worker console reads/writes this directly via the binding. The Mac runner
 * reaches it only through the /api/agent/* HTTP endpoints.
 */
import { getCollection } from "astro:content";
import type { BroadcastReport } from "~/lib/broadcast";

export interface AgentConfig {
  // youtube-scanner
  regionCode?: string;
  videoCategoryId?: string;
  videoCategoryIds?: string[]; // search across multiple categories (e.g. ["25","28"])
  order?: "date" | "viewCount";
  publishedWithinHours?: number;
  maxCandidatesPerRun?: number;
  maxPublishesPerRun?: number;
  maxScanPages?: number;
  query?: string;
  requireNetwork?: boolean; // if true, only the major-network channel allow-list
  // frontpage-curator
  maxFeatured?: number;
  perTopicCap?: number;
  recencyWeight?: number;
  popularityWeight?: number;
  engagementWeight?: number;
  // compliance-auditor
  maxPostsToAudit?: number;
  // breaking-news-curator
  maxBreaking?: number;
  recencyHours?: number;
  criticalityWeight?: number; // weight of Grok importance score
  stickiness?: number; // incumbent bonus so the strip only swaps for clearly-bigger news
  maxPerTopic?: number; // cap cards per broad topic
  // quip-writer
  quipCount?: number; // how many new quips to generate per run
  maxQuipPool?: number; // cap the rolling pool size
  // discover-curator / good-news-curator
  maxSections?: number; // max collections to publish per run
  poolSize?: number; // how many recent posts to consider
  // youtube-scanner (good-news surfacing)
  goodNewsSlots?: number; // per-run draft slots reserved for positive/uplifting headlines
}

export interface AgentLastRun {
  at: string;
  ok: boolean;
  message: string;
  submitted?: number;
  skipped?: number;
  durationMs?: number;
}

export interface Agent {
  id: string;
  kind: string;
  name: string;
  enabled: boolean;
  cron: string;
  config: AgentConfig;
  lastRun?: AgentLastRun;
}

export interface Registry {
  version: number;
  agents: Agent[];
}

export interface PendingDraft {
  draftId: string;
  agentId: string;
  videoId: string;
  sourceUrl: string;
  createdAt: string;
  source: {
    channel?: string;
    videoTitle?: string;
    transcriptUsed: boolean;
    publishedAt?: string;
  };
  report: BroadcastReport;
  nearDuplicates?: NearDuplicate[];
}

const REGISTRY_KEY = "agents:registry";
const FRONTPAGE_KEY = "frontpage:featured";
const DRAFT_PREFIX = "draft:";
const SEEN_PREFIX = "seen:";
const RUNNOW_PREFIX = "runnow:";
const DRAFT_TTL = 14 * 24 * 60 * 60; // 14 days
const SEEN_TTL = 30 * 24 * 60 * 60; // 30 days

// Seeded the first time the registry is read so the console + runner have an
// agent to work with without a "create agent" UI.
export const DEFAULT_REGISTRY: Registry = {
  version: 1,
  agents: [
    {
      id: "youtube-news-scanner",
      kind: "youtube-scanner",
      name: "YouTube News Scanner",
      enabled: true,
      cron: "0 * * * *",
      config: {
        regionCode: "US",
        // News & Politics (25) + Science & Technology (28) so big tech/space/
        // markets stories (e.g. a SpaceX IPO) are caught, not just DC politics.
        videoCategoryIds: ["25", "28"],
        // "date" surfaces fresh uploads (new stories) instead of the same
        // top-viewed videos that dedup keeps skipping.
        order: "date",
        publishedWithinHours: 48,
        maxCandidatesPerRun: 8,
        maxPublishesPerRun: 15,
        maxScanPages: 4,
        // Focused query — a very long OR query (40+ terms) caused YouTube to
        // miss obvious matches (e.g. SpaceX IPO videos). Keep it tight.
        query:
          "politics OR Congress OR \"White House\" OR election OR Trump OR \"Supreme Court\" OR economy OR inflation OR \"Wall Street\" OR stocks OR IPO OR SpaceX OR Tesla OR Musk OR Nvidia OR \"artificial intelligence\" OR immigration OR Iran OR Israel OR Ukraine OR China",
      },
    },
    {
      id: "frontpage-curator",
      kind: "frontpage-curator",
      name: "Front Page Curator",
      enabled: true,
      cron: "30 */3 * * *",
      config: {
        maxFeatured: 50,
        perTopicCap: 2,
        recencyWeight: 0.45,
        popularityWeight: 0.4,
        engagementWeight: 0.15,
      },
    },
    {
      id: "compliance-auditor",
      kind: "compliance-auditor",
      name: "Compliance Auditor (Don't-Get-Sued)",
      enabled: true,
      cron: "0 7 * * 1", // weekly, Mondays 07:00 UTC
      config: {
        maxPostsToAudit: 60,
      },
    },
    {
      id: "breaking-news-curator",
      kind: "breaking-news-curator",
      name: "Breaking News Curator",
      enabled: true,
      cron: "*/15 * * * *", // every 15 minutes — keep it fresh
      config: {
        maxBreaking: 50,
        recencyHours: 36,
        recencyWeight: 0.35,
        popularityWeight: 0.3,
        criticalityWeight: 0.35,
        stickiness: 0.15,
        maxPerTopic: 2,
      },
    },
    {
      id: "quip-writer",
      kind: "quip-writer",
      name: "Quip Writer (fun ticker)",
      enabled: true,
      cron: "0 9 */3 * *", // ~every 3 days, 09:00 UTC
      config: {
        quipCount: 30,
        maxQuipPool: 120,
      },
    },
    {
      id: "digest-sender",
      kind: "digest-sender",
      name: "News Digest Sender",
      enabled: true,
      // Daily at 13:00 UTC (~8am ET); the endpoint decides daily vs weekly and
      // skips users who already got one this period.
      cron: "0 13 * * *",
      config: {},
    },
    {
      id: "newsletter-sender",
      kind: "newsletter-sender",
      name: "Weekly Newsletter Sender",
      enabled: true,
      cron: "0 14 * * 1", // Mondays 14:00 UTC (~9am ET)
      config: {},
    },
    {
      id: "discover-curator",
      kind: "discover-curator",
      name: "Discover Curator",
      enabled: true,
      cron: "0 11 * * *", // daily, 11:00 UTC
      config: { maxSections: 6, poolSize: 80 },
    },
    {
      id: "good-news-curator",
      kind: "good-news-curator",
      name: "Good News Curator",
      enabled: true,
      cron: "30 11 * * *", // daily, 11:30 UTC (just after the Discover run)
      config: { maxSections: 6, poolSize: 120 },
    },
    {
      id: "dead-video-pruner",
      kind: "dead-video-pruner",
      name: "Dead Video Pruner",
      enabled: true,
      cron: "0 12 * * *", // daily, 12:00 UTC
      config: { maxDeletePerRun: 25, dryRun: false },
    },
  ],
};

export async function getRegistry(kv: KVNamespace): Promise<Registry> {
  const raw = await kv.get(REGISTRY_KEY);
  if (!raw) {
    await kv.put(REGISTRY_KEY, JSON.stringify(DEFAULT_REGISTRY));
    return DEFAULT_REGISTRY;
  }
  let reg: Registry;
  try {
    reg = JSON.parse(raw) as Registry;
  } catch {
    return DEFAULT_REGISTRY;
  }
  let changed = false;
  // Prune retired agents so they disappear from the stored registry + console.
  const before = reg.agents.length;
  reg.agents = reg.agents.filter((a) => !RETIRED_AGENT_IDS.has(a.id));
  if (reg.agents.length !== before) changed = true;
  // Reconcile: add any default agents that aren't in the stored registry yet
  // (so new agent kinds appear without wiping the existing config/lastRun).
  for (const def of DEFAULT_REGISTRY.agents) {
    if (!reg.agents.some((a) => a.id === def.id)) {
      reg.agents.push(def);
      changed = true;
    }
  }
  if (changed) await kv.put(REGISTRY_KEY, JSON.stringify(reg));
  return reg;
}

// Agents that have been retired; pruned from any stored registry on read.
const RETIRED_AGENT_IDS = new Set<string>(["trending-topics"]);

export async function putRegistry(kv: KVNamespace, reg: Registry): Promise<void> {
  await kv.put(REGISTRY_KEY, JSON.stringify(reg));
}

export async function patchAgent(
  kv: KVNamespace,
  agentId: string,
  patch: Partial<Pick<Agent, "enabled" | "cron">> & { config?: Partial<AgentConfig> }
): Promise<Agent | null> {
  const reg = await getRegistry(kv);
  const agent = reg.agents.find((a) => a.id === agentId);
  if (!agent) return null;
  if (typeof patch.enabled === "boolean") agent.enabled = patch.enabled;
  if (typeof patch.cron === "string") agent.cron = patch.cron;
  if (patch.config) agent.config = { ...agent.config, ...patch.config };
  await putRegistry(kv, reg);
  return agent;
}

export async function setLastRun(
  kv: KVNamespace,
  agentId: string,
  lastRun: AgentLastRun
): Promise<void> {
  const reg = await getRegistry(kv);
  const agent = reg.agents.find((a) => a.id === agentId);
  if (!agent) return;
  agent.lastRun = lastRun;
  await putRegistry(kv, reg);
}

// Manual "run now" requests: the console sets a timestamp; the runner picks it
// up on its next tick (~60s) and runs the agent regardless of cron, then clears.
export async function setRunNow(kv: KVNamespace, agentId: string): Promise<string> {
  const at = new Date().toISOString();
  await kv.put(RUNNOW_PREFIX + agentId, at, { expirationTtl: 3600 });
  return at;
}
export async function getRunNow(kv: KVNamespace, agentId: string): Promise<string | null> {
  return await kv.get(RUNNOW_PREFIX + agentId);
}
export async function clearRunNow(kv: KVNamespace, agentId: string, ts?: string): Promise<void> {
  if (!ts) {
    await kv.delete(RUNNOW_PREFIX + agentId);
    return;
  }
  const cur = await kv.get(RUNNOW_PREFIX + agentId);
  if (cur === ts) await kv.delete(RUNNOW_PREFIX + agentId);
}

export function draftId(agentId: string, videoId: string): string {
  return `${agentId}-${videoId}`;
}

export async function listDrafts(kv: KVNamespace): Promise<PendingDraft[]> {
  const list = await kv.list({ prefix: DRAFT_PREFIX });
  const drafts: PendingDraft[] = [];
  for (const key of list.keys) {
    const raw = await kv.get(key.name);
    if (raw) {
      try {
        drafts.push(JSON.parse(raw) as PendingDraft);
      } catch {
        // skip malformed
      }
    }
  }
  drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return drafts;
}

export async function getDraft(kv: KVNamespace, id: string): Promise<PendingDraft | null> {
  const raw = await kv.get(DRAFT_PREFIX + id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingDraft;
  } catch {
    return null;
  }
}

export async function putDraft(kv: KVNamespace, draft: PendingDraft): Promise<void> {
  await kv.put(DRAFT_PREFIX + draft.draftId, JSON.stringify(draft), {
    expirationTtl: DRAFT_TTL,
  });
}

// Maintenance: wipe KV families for a clean start.
async function clearByPrefix(kv: KVNamespace, prefix: string): Promise<number> {
  let cursor: string | undefined;
  let count = 0;
  do {
    const list = await kv.list({ prefix, cursor });
    for (const k of list.keys) {
      await kv.delete(k.name);
      count++;
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
  return count;
}
export async function clearDrafts(kv: KVNamespace): Promise<number> {
  return clearByPrefix(kv, DRAFT_PREFIX);
}
export async function clearSeen(kv: KVNamespace): Promise<number> {
  return clearByPrefix(kv, SEEN_PREFIX);
}
export async function clearFrontpage(kv: KVNamespace): Promise<void> {
  await kv.delete(FRONTPAGE_KEY);
}

export async function deleteDraft(kv: KVNamespace, id: string): Promise<void> {
  await kv.delete(DRAFT_PREFIX + id);
}

export async function markSeen(kv: KVNamespace, videoId: string): Promise<void> {
  await kv.put(SEEN_PREFIX + videoId, "1", { expirationTtl: SEEN_TTL });
}

export async function isSeen(kv: KVNamespace, videoId: string): Promise<boolean> {
  return (await kv.get(SEEN_PREFIX + videoId)) !== null;
}

/** Video ids already published (from the built content collection). */
export async function existingVideoIds(): Promise<Set<string>> {
  const posts = await getCollection("posts");
  const ids = new Set<string>();
  for (const p of posts) {
    if (p.data.videoId) ids.add(p.data.videoId);
  }
  return ids;
}

/* ---------- front-page curation ---------- */

export async function getFrontpage(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(FRONTPAGE_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export async function setFrontpage(kv: KVNamespace, ids: string[]): Promise<void> {
  await kv.put(FRONTPAGE_KEY, JSON.stringify(ids.slice(0, 50)));
}

const DISCOVER_KEY = "discover:sections";

// Discover = serendipitous, Grok-invented collections (fresh each run) grouping
// articles under offbeat angles a reader wouldn't ordinarily see together.
export interface DiscoverSection {
  title: string;
  blurb: string;
  ids: string[];
}

export async function getDiscover(kv: KVNamespace): Promise<DiscoverSection[]> {
  const raw = await kv.get(DISCOVER_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((s) => s && typeof s.title === "string" && Array.isArray(s.ids))
      .map((s) => ({
        title: String(s.title),
        blurb: typeof s.blurb === "string" ? s.blurb : "",
        ids: s.ids.map(String),
      }));
  } catch {
    return [];
  }
}

export async function setDiscover(kv: KVNamespace, sections: DiscoverSection[]): Promise<void> {
  await kv.put(DISCOVER_KEY, JSON.stringify(sections.slice(0, 8)));
}

const GOODNEWS_KEY = "goodnews:sections";

// Good News = themed collections of positive, uplifting, and otherwise
// interesting (non-grim) fact-checked reports. Same shape as Discover so the
// page renders identically; the curator fills it from the lighter side of the
// news instead of offbeat throughlines.
export type GoodNewsSection = DiscoverSection;

export async function getGoodNews(kv: KVNamespace): Promise<GoodNewsSection[]> {
  const raw = await kv.get(GOODNEWS_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((s) => s && typeof s.title === "string" && Array.isArray(s.ids))
      .map((s) => ({
        title: String(s.title),
        blurb: typeof s.blurb === "string" ? s.blurb : "",
        ids: s.ids.map(String),
      }));
  } catch {
    return [];
  }
}

export async function setGoodNews(kv: KVNamespace, sections: GoodNewsSection[]): Promise<void> {
  await kv.put(GOODNEWS_KEY, JSON.stringify(sections.slice(0, 8)));
}

const BREAKING_KEY = "breaking:featured";

// The Breaking feed is an ordered list (most impactful first) of items: a single
// post, or a temporary "group" (a same-story cluster shown as a topic shell with
// aggregated grade/lean). Groups are ephemeral — regenerated each curator run.
export type BreakingItem =
  | { type: "post"; id: string }
  | { type: "group"; slug: string; title: string; topic?: string; ids: string[] };

export async function getBreaking(kv: KVNamespace): Promise<BreakingItem[]> {
  const raw = await kv.get(BREAKING_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .map((it): BreakingItem | null => {
        if (typeof it === "string") return { type: "post", id: it }; // legacy shape
        if (it && it.type === "post" && typeof it.id === "string") return { type: "post", id: it.id };
        if (it && it.type === "group" && Array.isArray(it.ids)) {
          return {
            type: "group",
            slug: String(it.slug || ""),
            title: String(it.title || ""),
            topic: it.topic ? String(it.topic) : undefined,
            ids: it.ids.map(String),
          };
        }
        return null;
      })
      .filter((x): x is BreakingItem => x !== null);
  } catch {
    return [];
  }
}

export async function setBreaking(kv: KVNamespace, items: BreakingItem[]): Promise<void> {
  await kv.put(BREAKING_KEY, JSON.stringify(items.slice(0, 50)));
}

/* ---------- search categories (editor-managed scanner search terms) ---------- */

const CATEGORIES_KEY = "agents:categories";

export interface SearchCategory {
  id: string;
  label: string; // the YouTube search phrase
  group: string;
  enabled: boolean;
}

// Curated catalog the editor toggles on/off. New entries here are reconciled
// into the stored list (added, defaulting to their `enabled` here) without
// wiping the editor's existing on/off choices.
export const DEFAULT_CATEGORIES: SearchCategory[] = [
  { id: "us-politics", label: "US politics", group: "Politics & Government", enabled: true },
  { id: "congress", label: "Congress", group: "Politics & Government", enabled: true },
  { id: "white-house", label: "White House", group: "Politics & Government", enabled: true },
  { id: "elections", label: "elections", group: "Politics & Government", enabled: true },
  { id: "supreme-court", label: "Supreme Court", group: "Politics & Government", enabled: true },
  { id: "immigration", label: "immigration policy", group: "Politics & Government", enabled: true },
  { id: "abortion", label: "abortion law", group: "Politics & Government", enabled: true },
  { id: "guns", label: "gun policy", group: "Politics & Government", enabled: true },
  { id: "stock-market", label: "stock market", group: "Economy & Finance", enabled: true },
  { id: "federal-reserve", label: "Federal Reserve", group: "Economy & Finance", enabled: true },
  { id: "inflation", label: "inflation", group: "Economy & Finance", enabled: true },
  { id: "ipo", label: "IPO", group: "Economy & Finance", enabled: true },
  { id: "earnings", label: "company earnings", group: "Economy & Finance", enabled: true },
  { id: "jobs", label: "jobs report", group: "Economy & Finance", enabled: true },
  { id: "housing", label: "housing market", group: "Economy & Finance", enabled: true },
  { id: "crypto", label: "cryptocurrency", group: "Economy & Finance", enabled: true },
  { id: "ai", label: "artificial intelligence", group: "Technology", enabled: true },
  { id: "spacex", label: "SpaceX", group: "Technology", enabled: true },
  { id: "tesla", label: "Tesla", group: "Technology", enabled: true },
  { id: "nvidia", label: "Nvidia", group: "Technology", enabled: true },
  { id: "big-tech", label: "big tech", group: "Technology", enabled: true },
  { id: "ai-regulation", label: "AI regulation", group: "Technology", enabled: true },
  { id: "openai", label: "OpenAI", group: "Technology", enabled: true },
  { id: "anthropic", label: "Anthropic Claude", group: "Technology", enabled: true },
  { id: "ukraine", label: "Ukraine war", group: "World", enabled: true },
  { id: "israel-gaza", label: "Israel Gaza", group: "World", enabled: true },
  { id: "iran", label: "Iran", group: "World", enabled: true },
  { id: "china", label: "China US relations", group: "World", enabled: true },
];

export async function getSearchCategories(kv: KVNamespace): Promise<SearchCategory[]> {
  const raw = await kv.get(CATEGORIES_KEY);
  if (!raw) {
    await kv.put(CATEGORIES_KEY, JSON.stringify(DEFAULT_CATEGORIES));
    return DEFAULT_CATEGORIES;
  }
  let list: SearchCategory[];
  try {
    list = JSON.parse(raw) as SearchCategory[];
  } catch {
    return DEFAULT_CATEGORIES;
  }
  if (!Array.isArray(list)) return DEFAULT_CATEGORIES;
  let changed = false;
  for (const def of DEFAULT_CATEGORIES) {
    if (!list.some((x) => x.id === def.id)) {
      list.push(def);
      changed = true;
    }
  }
  if (changed) await kv.put(CATEGORIES_KEY, JSON.stringify(list));
  return list;
}

/* ---------- manual URL intake queue (bypasses the YouTube search quota) ----------
 * The editor (or a browser tool) drops YouTube URLs here; the runner pulls them,
 * fetches transcripts via yt-dlp, generates a web-grounded report, and drafts it
 * — no YouTube Data API search calls involved. */

const URLQUEUE_KEY = "agents:urlqueue";

export async function getUrlQueue(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(URLQUEUE_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
export async function enqueueUrls(kv: KVNamespace, urls: string[]): Promise<string[]> {
  const set = new Set(await getUrlQueue(kv));
  for (const u of urls) {
    const s = String(u).trim();
    if (s) set.add(s);
  }
  const list = [...set].slice(0, 500);
  await kv.put(URLQUEUE_KEY, JSON.stringify(list));
  return list;
}
export async function dequeueUrls(kv: KVNamespace, urls: string[]): Promise<string[]> {
  const remove = new Set(urls.map((u) => String(u)));
  const list = (await getUrlQueue(kv)).filter((u) => !remove.has(u));
  await kv.put(URLQUEUE_KEY, JSON.stringify(list));
  return list;
}

export async function setSearchCategories(kv: KVNamespace, list: SearchCategory[]): Promise<void> {
  const clean = (Array.isArray(list) ? list : [])
    .map((c) => ({
      id: String(c.id || "").trim(),
      label: String(c.label || "").trim(),
      group: String(c.group || "Custom").trim() || "Custom",
      enabled: Boolean(c.enabled),
    }))
    .filter((c) => c.id && c.label)
    .slice(0, 200);
  await kv.put(CATEGORIES_KEY, JSON.stringify(clean));
}

/* ---------- fun quip ticker ----------
 * Grok writes witty one-liners for the for-fun ticker under the Front Page; the
 * runner refreshes the pool every few days and the home page reads it. */

const QUIPS_KEY = "quips:list";

// Tone guard: a fact-checking site's fun ticker must never disparage facts,
// fact-checking, or expertise. Filtering here (the single choke-point both the
// home page and the agent GET read through) also self-heals the KV pool — the
// quip-writer merges via the same GET, so banned legacy entries drop out on
// its next run.
const BANNED_QUIP_PATTERNS: RegExp[] = [
  /facts?\s+are\s+slipper/i,
  /experts?\s+(are|were)\s+(just\s+)?guess/i,
  /age\s+like\s+milk/i,
  /reality\s+slaps?/i,
  /doomscrolling\s+is\s+just\s+anxiety/i,
  /facts?\s+(are|is)\s+\w*\s*(negotiable|optional|overrated)/i,
  /truth\s+is\s+(overrated|negotiable)/i,
];

export function filterQuips(quips: string[]): string[] {
  return quips.filter((q) => !BANNED_QUIP_PATTERNS.some((re) => re.test(q)));
}

export interface QuipData {
  updatedAt: string;
  quips: string[];
}

export async function getQuips(kv: KVNamespace): Promise<QuipData | null> {
  const raw = await kv.get(QUIPS_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || !Array.isArray(v.quips)) return null;
    return { ...v, quips: filterQuips(v.quips.map((q: unknown) => String(q ?? ""))) } as QuipData;
  } catch {
    return null;
  }
}

export async function setQuips(kv: KVNamespace, quips: string[]): Promise<void> {
  const data: QuipData = { updatedAt: new Date().toISOString(), quips: filterQuips(quips) };
  await kv.put(QUIPS_KEY, JSON.stringify(data));
}

/* ---------- markets ticker ----------
 * The runner fetches quotes (residential IP, reliable) and posts them here; the
 * home page reads this blob to render the scrolling ticker. */

const TICKER_KEY = "ticker:quotes";

export interface TickerQuote {
  label: string; // display label, e.g. "S&P 500", "NVDA"
  price: number;
  changePct: number; // signed percent change vs previous close
}

export interface TickerData {
  updatedAt: string;
  quotes: TickerQuote[];
}

export async function getTicker(kv: KVNamespace): Promise<TickerData | null> {
  const raw = await kv.get(TICKER_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && Array.isArray(v.quotes) ? (v as TickerData) : null;
  } catch {
    return null;
  }
}

export async function setTicker(kv: KVNamespace, quotes: TickerQuote[]): Promise<void> {
  const data: TickerData = { updatedAt: new Date().toISOString(), quotes };
  await kv.put(TICKER_KEY, JSON.stringify(data));
}

/* ---------- newsroom classifications (Grok-scored, shared by curators) ----------
 * A small per-post judgment the curators reuse so they don't re-call Grok every
 * tick. Stored as one blob keyed by post id. The runner classifies new posts and
 * merges them in; entries for posts no longer present are pruned on merge. */

const CLASSIFY_KEY = "agents:classifications";

export interface PostClassification {
  category: string; // politics | world | business | tech | science | sports | culture | health | tragedy | other
  broadTopic: string; // canonical, human topic label for grouping
  lighthearted: boolean; // lighter, non-political (legacy signal)
  criticality: number; // 0-100: how important/impactful as breaking news
  isTalkShow?: boolean; // talk show / panel / roundtable / commentary segment (Front Page)
  at: string; // ISO timestamp classified
}

export type ClassificationMap = Record<string, PostClassification>;

export async function getClassifications(kv: KVNamespace): Promise<ClassificationMap> {
  const raw = await kv.get(CLASSIFY_KEY);
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as ClassificationMap) : {};
  } catch {
    return {};
  }
}

/** Merge new classifications in and prune any not in `keepIds` (current posts). */
export async function mergeClassifications(
  kv: KVNamespace,
  updates: ClassificationMap,
  keepIds?: string[]
): Promise<ClassificationMap> {
  const cur = await getClassifications(kv);
  const merged: ClassificationMap = { ...cur, ...updates };
  if (keepIds && keepIds.length) {
    const keep = new Set(keepIds);
    for (const id of Object.keys(merged)) if (!keep.has(id)) delete merged[id];
  }
  await kv.put(CLASSIFY_KEY, JSON.stringify(merged));
  return merged;
}

/* ---------- reader flags (public "I disagree with the grade/lean") ----------
 * A reader on an article can flag the grade and/or political-lean assignment and
 * leave a comment. Stored one-per-key under `flag:`; the editor reviews them in
 * the console and either re-grades with AI or marks them reviewed. */

const FLAG_PREFIX = "flag:";
const FLAG_TTL = 180 * 24 * 60 * 60; // keep flags ~6 months

export type FlagAspect = "grade" | "lean" | "both";
export type FlagStatus = "open" | "reviewed" | "updated";

export interface ReaderFlag {
  id: string;
  postId: string;
  postHeadline: string;
  aspect: FlagAspect;
  comment: string;
  currentGrade: string | null;
  currentLeanScore: number | null;
  createdAt: string;
  status: FlagStatus;
  resolvedAt?: string;
  resolutionNote?: string;
}

export async function addFlag(
  kv: KVNamespace,
  f: Omit<ReaderFlag, "id" | "createdAt" | "status">
): Promise<ReaderFlag> {
  const flag: ReaderFlag = {
    ...f,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "open",
  };
  await kv.put(FLAG_PREFIX + flag.id, JSON.stringify(flag), { expirationTtl: FLAG_TTL });
  return flag;
}

export async function listFlags(kv: KVNamespace): Promise<ReaderFlag[]> {
  const out: ReaderFlag[] = [];
  let cursor: string | undefined;
  do {
    const list = await kv.list({ prefix: FLAG_PREFIX, cursor });
    for (const key of list.keys) {
      const raw = await kv.get(key.name);
      if (raw) {
        try {
          out.push(JSON.parse(raw) as ReaderFlag);
        } catch {
          // skip malformed
        }
      }
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
  // Open first, then newest-first within each status.
  out.sort((a, b) => {
    if ((a.status === "open") !== (b.status === "open")) return a.status === "open" ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  return out;
}

export async function getFlag(kv: KVNamespace, id: string): Promise<ReaderFlag | null> {
  const raw = await kv.get(FLAG_PREFIX + id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReaderFlag;
  } catch {
    return null;
  }
}

export async function setFlagStatus(
  kv: KVNamespace,
  id: string,
  status: FlagStatus,
  resolutionNote?: string
): Promise<ReaderFlag | null> {
  const flag = await getFlag(kv, id);
  if (!flag) return null;
  flag.status = status;
  flag.resolvedAt = new Date().toISOString();
  if (resolutionNote) flag.resolutionNote = resolutionNote;
  await kv.put(FLAG_PREFIX + id, JSON.stringify(flag), { expirationTtl: FLAG_TTL });
  return flag;
}

export async function deleteFlag(kv: KVNamespace, id: string): Promise<void> {
  await kv.delete(FLAG_PREFIX + id);
}

export async function openFlagCount(kv: KVNamespace): Promise<number> {
  const flags = await listFlags(kv);
  return flags.filter((f) => f.status === "open").length;
}

/* ---------- compliance auditor ---------- */

const COMPLIANCE_KEY = "compliance:report";

export type RiskLevel = "high" | "medium" | "low";

export interface ComplianceFinding {
  id?: string; // stable id within a report, for approve-and-apply
  postId: string;
  postUrl: string;
  headline: string;
  severity: RiskLevel;
  category: string;
  quote: string;
  issue: string;
  suggestion: string;
}

export interface ComplianceReport {
  generatedAt: string;
  overallRisk: RiskLevel;
  summary: string;
  postsAudited: number;
  disclaimer: {
    present: boolean;
    adequate: boolean;
    notes: string;
    suggestions: string[];
  };
  findings: ComplianceFinding[];
}

export async function getComplianceReport(kv: KVNamespace): Promise<ComplianceReport | null> {
  const raw = await kv.get(COMPLIANCE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ComplianceReport;
  } catch {
    return null;
  }
}

export async function setComplianceReport(kv: KVNamespace, report: ComplianceReport): Promise<void> {
  await kv.put(COMPLIANCE_KEY, JSON.stringify(report));
}

/** Drop a finding from the stored report once its fix has been applied. */
export async function removeComplianceFinding(
  kv: KVNamespace,
  id: string
): Promise<ComplianceReport | null> {
  const report = await getComplianceReport(kv);
  if (!report) return null;
  report.findings = report.findings.filter((f) => f.id !== id);
  await setComplianceReport(kv, report);
  return report;
}

export interface PostContent {
  id: string;
  url: string;
  type: string;
  headline: string;
  kicker: string | null;
  summary: string;
  verdict: string | null;
  assessment: string | null;
  notableConcerns: string[];
  keyMoments: { claim: string; verdict: string; note: string }[];
  sourceUrl: string;
  sourceTitle: string | null;
  citationCount: number;
  body: string;
}

/** Full published-post content for the compliance auditor to review. */
export async function publishedPostsContent(): Promise<PostContent[]> {
  const posts = await getCollection("posts", (p) => !p.data.draft);
  posts.sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
  return posts.map((p) => ({
    id: p.id,
    url: `/posts/${p.id}/`,
    type: p.data.type,
    headline: p.data.headline,
    kicker: p.data.kicker ?? null,
    summary: p.data.summary,
    verdict: p.data.verdict ?? null,
    assessment: p.data.assessment ?? null,
    notableConcerns: p.data.notableConcerns ?? [],
    keyMoments: p.data.keyMoments ?? [],
    sourceUrl: p.data.sourceUrl,
    sourceTitle: p.data.sourceTitle ?? null,
    citationCount: (p.data.citations ?? []).length,
    body: (p.body ?? "").slice(0, 4000),
  }));
}

export interface PostMeta {
  id: string;
  videoId: string | null;
  headline: string;
  videoTitle: string | null;
  topics: string[];
  publishedAt: string; // ISO date
  leanScore: number | null;
  sourceTitle: string | null;
}

/** Metadata for published (non-draft) posts, for the curator to score. */
export async function publishedPostsMeta(): Promise<PostMeta[]> {
  const posts = await getCollection("posts", (p) => !p.data.draft);
  return posts.map((p) => ({
    id: p.id,
    videoId: p.data.videoId ?? null,
    headline: p.data.headline,
    videoTitle: p.data.videoTitle ?? null,
    topics: p.data.topics ?? [],
    publishedAt: p.data.publishedAt.toISOString(),
    leanScore: typeof p.data.leanScore === "number" ? p.data.leanScore : null,
    sourceTitle: p.data.sourceTitle ?? null,
  }));
}

/* ---------- same-network story dedup ----------
 * Two posts may cover the same topic from DIFFERENT networks, but the same
 * network must never run the same story twice. We detect this by comparing the
 * candidate's title/headline against existing posts from the SAME channel using
 * token-overlap (Jaccard). Same channel + high overlap = duplicate. Different
 * channels never match here, so cross-network coverage of one topic is allowed.
 */

const STOP = new Set(
  ("the a an of to in on for and or with at by is are was were as that this it he she they we you " +
    "new news says say said after over amid into from but not has have had will would could about " +
    "his her its their your live breaking update updates report").split(" ")
);

export const SAME_STORY_THRESHOLD = 0.5;

function storyTokens(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function normChannel(c: string | undefined): string {
  return (c || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Best token-overlap between any pair of texts from each side. */
export function sameStory(textsA: string[], textsB: string[]): number {
  let max = 0;
  const setsB = textsB.filter(Boolean).map(storyTokens);
  for (const ta of textsA.filter(Boolean)) {
    const A = storyTokens(ta);
    for (const B of setsB) max = Math.max(max, jaccard(A, B));
  }
  return max;
}

export interface StoryRef {
  channel: string;
  texts: string[]; // [videoTitle, headline]
}

/** Published (incl. hidden — the file is still in the repo) stories. */
export async function publishedStories(): Promise<StoryRef[]> {
  const posts = await getCollection("posts");
  return posts.map((p) => ({
    channel: normChannel(p.data.sourceTitle),
    texts: [p.data.videoTitle ?? "", p.data.headline ?? ""],
  }));
}

async function draftStories(kv: KVNamespace, excludeDraftId?: string): Promise<StoryRef[]> {
  const drafts = await listDrafts(kv);
  return drafts
    .filter((d) => d.draftId !== excludeDraftId)
    .map((d) => ({
      channel: normChannel(d.source.channel),
      texts: [d.source.videoTitle ?? "", d.report.headline ?? ""],
    }));
}

/**
 * Is this candidate a duplicate of an existing same-network story? Checks
 * published posts and (optionally) pending drafts. Returns a short reason or null.
 */
export async function findDuplicateStory(
  kv: KVNamespace,
  cand: { channel: string; texts: string[]; includeDrafts?: boolean; excludeDraftId?: string }
): Promise<string | null> {
  const nc = normChannel(cand.channel);
  if (!nc) return null; // no channel → can't attribute to a network; skip this check

  const pub = await publishedStories();
  for (const s of pub) {
    if (s.channel === nc && sameStory(cand.texts, s.texts) >= SAME_STORY_THRESHOLD) {
      return "already published by this network";
    }
  }
  if (cand.includeDrafts) {
    const drafts = await draftStories(kv, cand.excludeDraftId);
    for (const s of drafts) {
      if (s.channel === nc && sameStory(cand.texts, s.texts) >= SAME_STORY_THRESHOLD) {
        return "already pending from this network";
      }
    }
  }
  return null;
}

/* ---------- cross-network near-duplicate detection ----------
 * findDuplicateStory only blocks the SAME network re-running a story. The gap:
 * near-identical coverage of one event from DIFFERENT networks published close
 * together reads as duplicate coverage (and, when the lean scores diverge, as
 * inconsistent grading). We surface these as warnings — never hard rejections —
 * so the editor decides. Lower threshold than SAME_STORY_THRESHOLD because the
 * goal is "flag for a human", not "block". */

export const NEAR_DUP_THRESHOLD = 0.35;
const NEAR_DUP_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface NearDuplicate {
  id: string; // post id (slug) or pending draftId
  headline: string;
  channel: string | null;
  leanScore: number | null;
  publishedAt: string;
  overlap: number;
  pending?: boolean; // true when the match is a queued draft, not a live post
}

/**
 * Find published posts and pending drafts (any channel) covering the same
 * story within a 48h window around the candidate's publish time. Returns
 * matches sorted by overlap, best first.
 */
export async function findNearDuplicates(
  kv: KVNamespace,
  cand: { texts: string[]; publishedAt?: string; excludeDraftId?: string }
): Promise<NearDuplicate[]> {
  const anchorDate = cand.publishedAt ? new Date(cand.publishedAt) : new Date();
  const anchor = Number.isNaN(anchorDate.getTime()) ? Date.now() : anchorDate.getTime();
  const inWindow = (iso: string): boolean => {
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && Math.abs(anchor - t) <= NEAR_DUP_WINDOW_MS;
  };

  const out: NearDuplicate[] = [];
  const posts = await publishedPostsMeta();
  for (const p of posts) {
    if (!inWindow(p.publishedAt)) continue;
    const overlap = sameStory(cand.texts, [p.videoTitle ?? "", p.headline]);
    if (overlap >= NEAR_DUP_THRESHOLD) {
      out.push({
        id: p.id,
        headline: p.headline,
        channel: p.sourceTitle,
        leanScore: p.leanScore,
        publishedAt: p.publishedAt,
        overlap,
      });
    }
  }
  const drafts = await listDrafts(kv);
  for (const d of drafts) {
    if (cand.excludeDraftId && d.draftId === cand.excludeDraftId) continue;
    const when = d.source.publishedAt ?? d.createdAt;
    if (!inWindow(when)) continue;
    const overlap = sameStory(cand.texts, [d.source.videoTitle ?? "", d.report.headline]);
    if (overlap >= NEAR_DUP_THRESHOLD) {
      out.push({
        id: d.draftId,
        headline: d.report.headline,
        channel: d.source.channel ?? null,
        leanScore: typeof d.report.leanScore === "number" ? d.report.leanScore : null,
        publishedAt: when,
        overlap,
        pending: true,
      });
    }
  }
  out.sort((a, b) => b.overlap - a.overlap);
  return out;
}

/** Max−min of the non-null lean scores across a cluster (0 if fewer than two). */
export function leanSpread(cands: { leanScore: number | null }[]): number {
  const scores = cands
    .map((c) => c.leanScore)
    .filter((s): s is number => typeof s === "number");
  if (scores.length < 2) return 0;
  return Math.max(...scores) - Math.min(...scores);
}
