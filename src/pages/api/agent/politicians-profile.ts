import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import {
  getPoliticianPhotoMap,
  getPoliticianScoutState,
  mergePoliticianPhotos,
  setPoliticianScoutState,
} from "~/lib/agents";
import {
  buildPoliticianIndex,
  resolvePoliticianSeeds,
} from "~/lib/politicians";
import { isCommonsMediaUrl, photoForSlug } from "~/lib/politicianPhotos";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET — roster slice + appearance counts + photo map + scout cursor.
 * Used by politician-profile-builder to pick who needs coverage/photos next.
 */
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }

  const { seeds, updatedAt, source } = await resolvePoliticianSeeds(env.AGENTS);
  const posts = await getCollection("posts", (p) => !p.data.draft);
  const index = buildPoliticianIndex(posts, seeds);
  const counts: Record<string, number> = {};
  for (const p of index) counts[p.slug] = p.appearances.length;

  const photos = (await getPoliticianPhotoMap(env.AGENTS)) ?? { updatedAt: "", bySlug: {} };
  const scout = await getPoliticianScoutState(env.AGENTS);

  // Compact payload for the runner (names + buckets only).
  // hasPhoto = static map ∪ live KV so the agent does not re-hit known faces.
  const people = seeds
    .filter((s) => s.bucket !== "Coverage")
    .map((s) => {
      const slug = s.slug;
      const staticPhoto = photoForSlug(slug);
      const kvPhoto = photos.bySlug[slug];
      return {
        slug,
        name: s.name,
        race: s.race ?? "",
        bucket: s.bucket ?? "Other",
        appearances: counts[slug] ?? 0,
        hasPhoto: Boolean(
          (staticPhoto && isCommonsMediaUrl(staticPhoto)) ||
            (kvPhoto && isCommonsMediaUrl(kvPhoto))
        ),
      };
    });

  const staticPhotoCount = people.filter((p) => {
    const u = photoForSlug(p.slug);
    return u && isCommonsMediaUrl(u);
  }).length;

  return json({
    rosterUpdatedAt: updatedAt,
    rosterSource: source,
    people,
    photoCount: Object.keys(photos.bySlug).length,
    staticPhotoCount,
    withPhoto: people.filter((p) => p.hasPhoto).length,
    underCovered: people.filter((p) => p.appearances < 3).length,
    scout,
  });
};

/**
 * POST — merge portrait URLs and/or advance scout cursor.
 * Body: { photos?: Record<slug,url>, scout?: { cursor: number } }
 */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  let body: { photos?: Record<string, string>; scout?: { cursor?: number } };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  let photoCount = 0;
  if (body.photos && typeof body.photos === "object") {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.photos).slice(0, 200)) {
      // Licensing gate (docs/legal/image-claims.md): the portrait pipeline
      // carries Wikimedia Commons files only — Commons hosts free-licensed
      // media; enwiki-local lead images can be non-free fair-use files.
      if (typeof v === "string" && v.length <= 500 && isCommonsMediaUrl(v)) cleaned[k] = v;
    }
    const map = await mergePoliticianPhotos(env.AGENTS, cleaned);
    photoCount = Object.keys(map.bySlug).length;
  }

  if (body.scout && typeof body.scout.cursor === "number") {
    await setPoliticianScoutState(env.AGENTS, {
      cursor: Math.max(0, Math.floor(body.scout.cursor)),
      updatedAt: new Date().toISOString(),
    });
  }

  return json({ ok: true, photoCount });
};
