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
  regionCode: string;
  videoCategoryId: string;
  order: "date" | "viewCount";
  publishedWithinHours: number;
  maxCandidatesPerRun: number;
  maxPublishesPerRun: number;
  query: string;
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
const DRAFT_PREFIX = "draft:";
const SEEN_PREFIX = "seen:";
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
      enabled: false,
      cron: "0 */6 * * *",
      config: {
        regionCode: "US",
        videoCategoryId: "25",
        order: "viewCount",
        publishedWithinHours: 24,
        maxCandidatesPerRun: 8,
        maxPublishesPerRun: 3,
        query: "politics OR congress OR white house OR election",
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
  try {
    return JSON.parse(raw) as Registry;
  } catch {
    return DEFAULT_REGISTRY;
  }
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
