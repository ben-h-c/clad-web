/**
 * Clad Studio cloud relay — shared helpers.
 * Auth: Bearer token = env.CLAD_STUDIO_RELAY_TOKEN (same secret on Mac + iPad).
 * Storage: AGENTS KV (no R2 required).
 */
import { env } from "cloudflare:workers";

export const MAX_ZIP_BYTES = 22 * 1024 * 1024; // under KV 25MB limit
const CHUNK = 900_000; // ~0.9MB chunks when needed

export type StudioTicketMeta = {
  ticketId: string;
  filename: string;
  status: string;
  updatedAt: string;
  lastNote?: string | null;
  error?: string | null;
  hasProposal?: boolean;
  hasPreview?: boolean;
  proposalMarkdown?: string | null;
  summary?: Record<string, unknown> | null;
  shipCommit?: string | null;
  shipUrl?: string | null;
  revision?: number;
  feedback?: unknown[];
  claimedAt?: string | null;
  zipChunks?: number;
  pendingDecision?: { action: string; notes: string; at: string } | null;
};

export function relayConfigured(): boolean {
  return Boolean(env.CLAD_STUDIO_RELAY_TOKEN && String(env.CLAD_STUDIO_RELAY_TOKEN).length >= 16);
}

export function authorizeStudio(request: Request): boolean {
  if (!relayConfigured()) return false;
  const hdr = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(hdr);
  if (!m) return false;
  const got = m[1].trim();
  const want = String(env.CLAD_STUDIO_RELAY_TOKEN);
  if (got.length !== want.length) return false;
  // constant-time-ish compare
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

export function json(body: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Clad-Filename",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...(extra ?? {}),
    },
  });
}

export function unauthorized(): Response {
  return json({ ok: false, error: "Unauthorized" }, 401);
}

export function notConfigured(): Response {
  return json(
    {
      ok: false,
      error: "Studio relay not configured. Set CLAD_STUDIO_RELAY_TOKEN on the Worker.",
    },
    503
  );
}

function metaKey(id: string) {
  return `studio:ticket:${id}:meta`;
}
function zipKey(id: string, i: number) {
  return `studio:ticket:${id}:zip:${i}`;
}
function previewKey(id: string) {
  return `studio:ticket:${id}:preview`;
}
function pendingKey() {
  return "studio:pending";
}
function pendingDecisionsKey() {
  return "studio:pending-decisions";
}

export function safeTicketId(raw: string): string {
  return path.basename(String(raw).replace(/[^\w.\-]+/g, "_")).slice(0, 180);
}

// path.basename polyfill for workers
const path = {
  basename(p: string) {
    const s = p.replace(/\\/g, "/");
    const i = s.lastIndexOf("/");
    return i >= 0 ? s.slice(i + 1) : s;
  },
};

export async function getMeta(id: string): Promise<StudioTicketMeta | null> {
  const raw = await env.AGENTS.get(metaKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StudioTicketMeta;
  } catch {
    return null;
  }
}

export async function putMeta(meta: StudioTicketMeta): Promise<void> {
  meta.updatedAt = new Date().toISOString();
  await env.AGENTS.put(metaKey(meta.ticketId), JSON.stringify(meta), {
    expirationTtl: 60 * 60 * 24 * 14, // 14 days
  });
}

export async function putZip(id: string, data: ArrayBuffer): Promise<number> {
  const bytes = new Uint8Array(data);
  const chunks = Math.max(1, Math.ceil(bytes.length / CHUNK));
  const puts: Promise<unknown>[] = [];
  for (let i = 0; i < chunks; i++) {
    const slice = bytes.subarray(i * CHUNK, Math.min(bytes.length, (i + 1) * CHUNK));
    puts.push(
      env.AGENTS.put(zipKey(id, i), slice, {
        expirationTtl: 60 * 60 * 24 * 14,
      })
    );
  }
  await Promise.all(puts);
  return chunks;
}

export async function getZip(id: string, chunks: number): Promise<ArrayBuffer | null> {
  if (!chunks || chunks < 1) return null;
  const parts: Uint8Array[] = [];
  let total = 0;
  for (let i = 0; i < chunks; i++) {
    const buf = await env.AGENTS.get(zipKey(id, i), "arrayBuffer");
    if (!buf) return null;
    const u = new Uint8Array(buf);
    parts.push(u);
    total += u.length;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out.buffer;
}

export async function putPreview(id: string, data: ArrayBuffer): Promise<void> {
  await env.AGENTS.put(previewKey(id), data, {
    expirationTtl: 60 * 60 * 24 * 14,
  });
}

export async function getPreview(id: string): Promise<ArrayBuffer | null> {
  return env.AGENTS.get(previewKey(id), "arrayBuffer");
}

export async function listPending(): Promise<string[]> {
  const raw = await env.AGENTS.get(pendingKey());
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export async function setPending(ids: string[]): Promise<void> {
  await env.AGENTS.put(pendingKey(), JSON.stringify(ids.slice(0, 100)), {
    expirationTtl: 60 * 60 * 24 * 14,
  });
}

export async function enqueuePending(id: string): Promise<void> {
  const list = await listPending();
  if (!list.includes(id)) list.push(id);
  await setPending(list);
}

export async function dequeuePending(id: string): Promise<void> {
  const list = (await listPending()).filter((x) => x !== id);
  await setPending(list);
}

export async function listPendingDecisions(): Promise<string[]> {
  const raw = await env.AGENTS.get(pendingDecisionsKey());
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export async function setPendingDecisions(ids: string[]): Promise<void> {
  await env.AGENTS.put(pendingDecisionsKey(), JSON.stringify(ids.slice(0, 100)), {
    expirationTtl: 60 * 60 * 24 * 14,
  });
}

export async function enqueueDecision(id: string): Promise<void> {
  const list = await listPendingDecisions();
  if (!list.includes(id)) list.push(id);
  await setPendingDecisions(list);
}

export async function dequeueDecision(id: string): Promise<void> {
  const list = (await listPendingDecisions()).filter((x) => x !== id);
  await setPendingDecisions(list);
}

export function publicTicketView(meta: StudioTicketMeta) {
  return {
    ok: true,
    ticketId: meta.ticketId,
    status: meta.status,
    updatedAt: meta.updatedAt,
    lastNote: meta.lastNote ?? null,
    error: meta.error ?? null,
    hasProposal: Boolean(meta.hasProposal || meta.proposalMarkdown),
    hasPreview: Boolean(meta.hasPreview),
    proposalMarkdown: meta.proposalMarkdown ?? null,
    summary: meta.summary ?? null,
    shipCommit: meta.shipCommit ?? null,
    shipUrl: meta.shipUrl ?? null,
    revision: meta.revision ?? 0,
    feedback: meta.feedback ?? [],
    transport: "cloud",
  };
}
