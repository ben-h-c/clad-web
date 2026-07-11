/**
 * Operational stats for the console. Visitor analytics is Phase 2
 * (fetchVisitorStats) — returns null until Cloudflare Web Analytics is wired.
 */
import { getCollection } from "astro:content";
import { listDrafts, getRegistry } from "./agents.ts";

export interface ContentStats {
  total: number;
  published: number;
  hidden: number;
  byGrade: { label: string; count: number }[];
  byLean: { label: string; count: number }[];
  byMonth: { label: string; count: number }[];
  pendingDrafts: number;
  lastPublish: string | null;
  agentRuns: { name: string; ok: boolean | null; at: string | null; message: string }[];
}

const LEAN_LABELS: Record<string, string> = {
  left: "Leans Left",
  "center-left": "Center-Left",
  center: "Centered",
  "center-right": "Center-Right",
  right: "Leans Right",
  none: "No Bias",
};

export async function contentStats(kv: KVNamespace): Promise<ContentStats> {
  const posts = await getCollection("posts");
  const published = posts.filter((p) => !p.data.draft);

  const gradeCounts = new Map<string, number>();
  const leanCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();
  let last: Date | null = null;

  for (const p of published) {
    if (p.data.letterGrade) gradeCounts.set(p.data.letterGrade, (gradeCounts.get(p.data.letterGrade) ?? 0) + 1);
    if (p.data.politicalLean) {
      const l = LEAN_LABELS[p.data.politicalLean] ?? p.data.politicalLean;
      leanCounts.set(l, (leanCounts.get(l) ?? 0) + 1);
    }
    const d = p.data.publishedAt;
    const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthCounts.set(mk, (monthCounts.get(mk) ?? 0) + 1);
    if (!last || d > last) last = d;
  }

  const GRADE_ORDER = ["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F"];
  const byGrade = GRADE_ORDER.filter((g) => gradeCounts.has(g)).map((g) => ({ label: g, count: gradeCounts.get(g)! }));
  const byLean = [...leanCounts.entries()].map(([label, count]) => ({ label, count }));
  const byMonth = [...monthCounts.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).map(([label, count]) => ({ label, count }));

  let pendingDrafts = 0;
  try {
    pendingDrafts = (await listDrafts(kv)).length;
  } catch {
    pendingDrafts = 0;
  }

  let agentRuns: ContentStats["agentRuns"] = [];
  try {
    const reg = await getRegistry(kv);
    agentRuns = reg.agents.map((a) => ({
      name: a.name,
      ok: a.lastRun ? a.lastRun.ok : null,
      at: a.lastRun?.at ?? null,
      message: a.lastRun?.message ?? "never run",
    }));
  } catch {
    agentRuns = [];
  }

  return {
    total: posts.length,
    published: published.length,
    hidden: posts.length - published.length,
    byGrade,
    byLean,
    byMonth,
    pendingDrafts,
    lastPublish: last ? last.toISOString().slice(0, 10) : null,
    agentRuns,
  };
}

export interface VisitorStats {
  pageviews24h: number;
  visitors24h: number;
  pageviews7d: number;
  visitors7d: number;
}

/**
 * Phase 2: query Cloudflare Web Analytics (GraphQL). Returns null until
 * CF_ANALYTICS_TOKEN + CF_ACCOUNT_ID are configured.
 */
export async function fetchVisitorStats(env: any): Promise<VisitorStats | null> {
  if (!env?.CF_ANALYTICS_TOKEN || !env?.CF_ACCOUNT_ID) return null;
  const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const query = `query($a:String!,$d1:Time!,$d7:Time!,$now:Time!){
    viewer{ accounts(filter:{accountTag:$a}){
      d24: rumPageloadEventsAdaptiveGroups(limit:1, filter:{datetime_geq:$d1, datetime_leq:$now}){ count sum{visits} }
      d7: rumPageloadEventsAdaptiveGroups(limit:1, filter:{datetime_geq:$d7, datetime_leq:$now}){ count sum{visits} }
    }}}`;
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`,
      },
      body: JSON.stringify({
        query,
        variables: { a: env.CF_ACCOUNT_ID, d1: since(1), d7: since(7), now: new Date().toISOString() },
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const acct = data?.data?.viewer?.accounts?.[0];
    if (!acct) return null;
    return {
      pageviews24h: acct.d24?.[0]?.count ?? 0,
      visitors24h: acct.d24?.[0]?.sum?.visits ?? 0,
      pageviews7d: acct.d7?.[0]?.count ?? 0,
      visitors7d: acct.d7?.[0]?.sum?.visits ?? 0,
    };
  } catch {
    return null;
  }
}
