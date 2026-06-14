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
  // trending-topics
  maxTopics?: number;
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
        maxFeatured: 15,
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
      cron: "0 7 * * *", // daily, 07:00 UTC
      config: {
        maxPostsToAudit: 60,
      },
    },
    {
      id: "trending-topics",
      kind: "trending-topics",
      name: "Trending Topics (public interest)",
      enabled: true,
      cron: "0 */4 * * *", // every 4 hours
      config: {
        maxTopics: 15,
      },
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
  // Reconcile: add any default agents that aren't in the stored registry yet
  // (so new agent kinds appear without wiping the existing config/lastRun).
  let changed = false;
  for (const def of DEFAULT_REGISTRY.agents) {
    if (!reg.agents.some((a) => a.id === def.id)) {
      reg.agents.push(def);
      changed = true;
    }
  }
  if (changed) await kv.put(REGISTRY_KEY, JSON.stringify(reg));
  return reg;
}

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
  await kv.put(FRONTPAGE_KEY, JSON.stringify(ids.slice(0, 30)));
}

/* ---------- trending topics (dynamic, public-interest search terms) ---------- */

const TRENDING_KEY = "agents:trending";

export interface TrendingTopics {
  updatedAt: string;
  topics: string[];
}

export async function getTrendingTopics(kv: KVNamespace): Promise<TrendingTopics | null> {
  const raw = await kv.get(TRENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TrendingTopics;
  } catch {
    return null;
  }
}

export async function setTrendingTopics(kv: KVNamespace, topics: string[]): Promise<void> {
  const clean = topics.map((t) => String(t).trim()).filter(Boolean).slice(0, 30);
  await kv.put(TRENDING_KEY, JSON.stringify({ updatedAt: new Date().toISOString(), topics: clean }));
}

/* ---------- compliance auditor ---------- */

const COMPLIANCE_KEY = "compliance:report";

export type RiskLevel = "high" | "medium" | "low";

export interface ComplianceFinding {
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
