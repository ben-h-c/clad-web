/**
 * Copy production AGENTS KV → staging AGENTS.
 * Home packs, agent registry, politicians, ticker, etc.
 * Does not copy drafts, seen-ledger, flags, or D1 users.
 */

export const STAGING_SYNC_PREFIXES = [
  "agents:registry",
  "home:",
  "frontpage:",
  "breaking:",
  "discover:",
  "goodnews:",
  "good-news:",
  "layout:",
  "calendar:",
  "quips",
  "ticker:",
  "agents:classifications",
  "social:sentiments",
  "races:",
  "elections:",
  "politicians:",
  "compliance:",
  "sharetags:",
] as const;

export const STAGING_SYNC_META_KEY = "staging:last-prod-sync";

export type StagingSyncResult = {
  copied: number;
  errors: number;
  skipped: number;
  prefixes: string[];
  at: string;
  tookMs: number;
  errorSamples: string[];
};

export type StagingSyncMeta = {
  at: string;
  copied: number;
  errors: number;
  tookMs: number;
};

async function listAllKeys(ns: KVNamespace, prefix: string): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await ns.list({ prefix, cursor });
    for (const k of page.keys) names.push(k.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return names;
}

export async function readStagingSyncMeta(kv: KVNamespace): Promise<StagingSyncMeta | null> {
  const raw = await kv.get(STAGING_SYNC_META_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StagingSyncMeta;
  } catch {
    return null;
  }
}

export async function syncStagingFromProd(
  source: KVNamespace,
  dest: KVNamespace
): Promise<StagingSyncResult> {
  const started = Date.now();
  const names = new Set<string>();
  for (const prefix of STAGING_SYNC_PREFIXES) {
    for (const name of await listAllKeys(source, prefix)) {
      if (name === STAGING_SYNC_META_KEY) continue;
      names.add(name);
    }
  }

  let copied = 0;
  let errors = 0;
  let skipped = 0;
  const errorSamples: string[] = [];
  const list = [...names];

  const CONCURRENCY = 8;
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const chunk = list.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (name) => {
        try {
          const val = await source.get(name);
          if (val == null) return { name, ok: true as const, skipped: true };
          await dest.put(name, val);
          return { name, ok: true as const, skipped: false };
        } catch (e) {
          return { name, ok: false as const, error: String((e as Error)?.message || e).slice(0, 160) };
        }
      })
    );
    for (const r of results) {
      if (!r.ok) {
        errors += 1;
        if (errorSamples.length < 8) errorSamples.push(`${r.name}: ${r.error}`);
      } else if (r.skipped) skipped += 1;
      else copied += 1;
    }
  }

  const at = new Date().toISOString();
  const tookMs = Date.now() - started;
  const meta: StagingSyncMeta = { at, copied, errors, tookMs };
  await dest.put(STAGING_SYNC_META_KEY, JSON.stringify(meta));

  return {
    copied,
    errors,
    skipped,
    prefixes: [...STAGING_SYNC_PREFIXES],
    at,
    tookMs,
    errorSamples,
  };
}
