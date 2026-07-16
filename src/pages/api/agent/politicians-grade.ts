import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import {
  getPersonProfileMap,
  mergePersonProfiles,
  type PersonProfile,
} from "~/lib/politicianProfiles";
import {
  buildPoliticianIndex,
  officeHierarchyRank,
  resolvePoliticianSeeds,
} from "~/lib/politicians";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const LETTER = new Set([
  "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F",
]);

/**
 * GET — who still needs a person-level grade (priority: most appearances, no profile).
 */
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const { seeds } = await resolvePoliticianSeeds(env.AGENTS);
  const posts = await getCollection("posts", (p) => !p.data.draft);
  const profiles = await getPersonProfileMap(env.AGENTS);
  const index = buildPoliticianIndex(posts, seeds, profiles);

  const queue = index
    .filter((p) => p.bucket !== "Coverage")
    .map((p) => {
      const stored = profiles?.bySlug?.[p.slug];
      const hasAgent = stored?.source === "agent";
      const hasSeed = Boolean(stored || p.personLean != null);
      // Re-score agent grades older than 90 days so the corpus stays fresh.
      const ageMs = stored?.updatedAt ? Date.now() - Date.parse(stored.updatedAt) : Infinity;
      const stale = hasAgent && Number.isFinite(ageMs) && ageMs > 90 * 86_400_000;
      return {
        slug: p.slug,
        name: p.name,
        race: p.race ?? "",
        bucket: p.bucket,
        appearances: p.appearances.length,
        needsGrade: !hasAgent || stale,
        hasLean: p.personLean != null,
        hasSeedOnly: hasSeed && !hasAgent,
        hierarchy: officeHierarchyRank(p),
      };
    })
    // Never-graded first, then hierarchy (President before back-bench), then heat, then alpha.
    .sort((a, b) => {
      if (a.needsGrade !== b.needsGrade) return a.needsGrade ? -1 : 1;
      if (a.hierarchy !== b.hierarchy) return a.hierarchy - b.hierarchy;
      if (b.appearances !== a.appearances) return b.appearances - a.appearances;
      return a.name.localeCompare(b.name);
    });

  return json({
    total: queue.length,
    graded: queue.filter((q) => !q.needsGrade).length,
    queue,
  });
};

/**
 * POST — merge person profiles from the grader agent.
 * Body: { profiles: Record<slug, PersonProfile-like> }
 */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  let body: { profiles?: Record<string, Partial<PersonProfile>> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!body.profiles || typeof body.profiles !== "object") {
    return json({ error: "profiles object required" }, 400);
  }

  const additions: Record<string, PersonProfile> = {};
  const now = new Date().toISOString();
  for (const [slug, raw] of Object.entries(body.profiles).slice(0, 40)) {
    if (!raw || typeof raw !== "object") continue;
    const lean = Number(raw.leanScore);
    if (!Number.isFinite(lean)) continue;
    const grade = raw.letterGrade ? String(raw.letterGrade).trim() : null;
    if (grade && !LETTER.has(grade)) continue;
    additions[slug.toLowerCase()] = {
      leanScore: Math.max(-100, Math.min(100, Math.round(lean))),
      leanRationale: String(raw.leanRationale || "").slice(0, 800),
      letterGrade: grade,
      factualityScore:
        typeof raw.factualityScore === "number"
          ? Math.max(0, Math.min(100, Math.round(raw.factualityScore)))
          : null,
      gradeRationale: raw.gradeRationale ? String(raw.gradeRationale).slice(0, 800) : null,
      updatedAt: now,
      source: "agent",
    };
  }

  if (Object.keys(additions).length === 0) {
    return json({ error: "no valid profiles" }, 400);
  }

  const map = await mergePersonProfiles(env.AGENTS, additions);
  return json({
    ok: true,
    saved: Object.keys(additions).length,
    total: Object.keys(map.bySlug).length,
  });
};
