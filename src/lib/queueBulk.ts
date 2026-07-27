/**
 * Background bulk-submit for the admin pending queue.
 * State lives in AGENTS KV so processing continues after the editor navigates away.
 * Each tick publishes/rejects one draft, then self-chains via waitUntil.
 */

export const QUEUE_BULK_KEY = "admin:queue-bulk-job";

export type QueueBulkStatus = "idle" | "running" | "done" | "error";

export interface QueueBulkJob {
  status: QueueBulkStatus;
  startedAt: string;
  updatedAt: string;
  /** Draft ids still to process (front = next). */
  remaining: string[];
  total: number;
  published: number;
  rejected: number;
  failed: number;
  /** Last draft id being/was processed (debug). */
  current?: string | null;
  lastError?: string | null;
  /** Human-readable last outcome. */
  lastNote?: string | null;
}

export function emptyBulkJob(): QueueBulkJob {
  const now = new Date().toISOString();
  return {
    status: "idle",
    startedAt: now,
    updatedAt: now,
    remaining: [],
    total: 0,
    published: 0,
    rejected: 0,
    failed: 0,
    current: null,
    lastError: null,
    lastNote: null,
  };
}

export async function getQueueBulkJob(kv: KVNamespace): Promise<QueueBulkJob | null> {
  const raw = await kv.get(QUEUE_BULK_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as QueueBulkJob;
  } catch {
    return null;
  }
}

export async function putQueueBulkJob(kv: KVNamespace, job: QueueBulkJob): Promise<void> {
  job.updatedAt = new Date().toISOString();
  // Keep finished jobs around for a day so the UI can show the summary.
  const ttl = job.status === "running" ? 60 * 60 * 6 : 60 * 60 * 24;
  await kv.put(QUEUE_BULK_KEY, JSON.stringify(job), { expirationTtl: ttl });
}

/** Stuck if still "running" but no progress for this long (ms). */
export const BULK_STALE_MS = 20 * 60 * 1000;

export function isBulkJobStale(job: QueueBulkJob, now = Date.now()): boolean {
  if (job.status !== "running") return false;
  const t = Date.parse(job.updatedAt);
  if (Number.isNaN(t)) return true;
  return now - t > BULK_STALE_MS;
}

export function bulkJobSummary(job: QueueBulkJob): string {
  const done = job.published + job.rejected + job.failed;
  if (job.status === "running") {
    return `Background job: ${done}/${job.total} — ${job.published} published, ${job.rejected} rejected, ${job.failed} failed${job.lastNote ? ` · ${job.lastNote}` : ""}`;
  }
  if (job.status === "done") {
    return `Last run done — ${job.published} published, ${job.rejected} rejected, ${job.failed} failed (of ${job.total})`;
  }
  if (job.status === "error") {
    return `Last run error — ${job.lastError || "unknown"} (${job.published} published, ${job.rejected} rejected, ${job.failed} failed)`;
  }
  return "";
}
