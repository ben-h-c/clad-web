import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import {
  getPoliticianRoster,
  setPoliticianRoster,
  type PoliticianRosterLive,
  type PoliticianRosterSeed,
} from "~/lib/agents";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sanitizeSeed(raw: unknown): PoliticianRosterSeed | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const name = String(s.name ?? "").trim();
  const slug = String(s.slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!name || !slug || slug.length < 2) return null;
  const bucket = String(s.bucket ?? "Other").trim();
  const allowed = new Set(["Executive", "Senate", "House", "Governor", "Supreme Court"]);
  if (!allowed.has(bucket)) return null;
  const aliases = Array.isArray(s.aliases)
    ? s.aliases.map((a) => String(a).trim()).filter((a) => a.length >= 2).slice(0, 12)
    : [name];
  if (!aliases.includes(name)) aliases.unshift(name);
  return {
    name: name.slice(0, 120),
    slug: slug.slice(0, 80),
    race: s.race ? String(s.race).slice(0, 160) : undefined,
    bucket,
    aliases,
  };
}

/** GET — last live roster (or empty). */
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const roster = await getPoliticianRoster(env.AGENTS);
  return json({ roster });
};

/**
 * POST — replace the live officeholder roster.
 * Body: { updatedAt?, source?, seeds: PoliticianRosterSeed[] }
 */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  let body: { updatedAt?: string; source?: string; seeds?: unknown[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!Array.isArray(body.seeds)) return json({ error: "seeds array required" }, 400);

  const seeds: PoliticianRosterSeed[] = [];
  const seen = new Set<string>();
  for (const raw of body.seeds.slice(0, 1200)) {
    const s = sanitizeSeed(raw);
    if (!s || seen.has(s.slug)) continue;
    seen.add(s.slug);
    seeds.push(s);
  }

  // Sanity: a real sync should land hundreds of members, not a handful.
  if (seeds.length < 100) {
    return json({ error: `too few seeds (${seeds.length}); refusing to overwrite roster` }, 400);
  }

  const counts: Record<string, number> = {};
  for (const s of seeds) counts[s.bucket] = (counts[s.bucket] || 0) + 1;

  const roster: PoliticianRosterLive = {
    updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : new Date().toISOString(),
    source: String(body.source || "politician-roster-sync").slice(0, 300),
    seeds,
    counts,
  };
  await setPoliticianRoster(env.AGENTS, roster);
  return json({ ok: true, total: seeds.length, counts, updatedAt: roster.updatedAt });
};
