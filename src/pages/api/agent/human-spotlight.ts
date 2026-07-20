import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getHumanSpotlight, setHumanSpotlight } from "~/lib/agents";
import { isCommonsMediaUrl } from "~/lib/politicianPhotos";
import {
  normalizeSpotlightPerson,
  spotlightDateKey,
  spotlightDateLabel,
} from "~/lib/humanSpotlight";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** GET — current spotlight + desk date (for the agent). */
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const store = await getHumanSpotlight(env.AGENTS);
  return json({
    store,
    dateKey: spotlightDateKey(),
    dateLabel: spotlightDateLabel(),
  });
};

/**
 * POST — replace today's Human Spotlight.
 * Body: { dateKey, dateLabel?, person: {...}, recentNames? }
 */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  let body: {
    dateKey?: string;
    dateLabel?: string;
    person?: unknown;
    recentNames?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const dateKey = String(body.dateKey || spotlightDateKey()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return json({ error: "invalid dateKey (YYYY-MM-DD)" }, 400);
  }

  const person = normalizeSpotlightPerson(body.person);
  if (!person) {
    return json({ error: "person required (name, achievement, article)" }, 400);
  }
  if (person.imageUrl && !isCommonsMediaUrl(person.imageUrl)) {
    person.imageUrl = null;
  }

  const prev = await getHumanSpotlight(env.AGENTS);
  const priorNames = Array.isArray(body.recentNames)
    ? body.recentNames.map((n) => String(n || "").trim()).filter(Boolean)
    : prev?.recentNames || [];
  const recentNames = [person.name, ...priorNames.filter((n) => n.toLowerCase() !== person.name.toLowerCase())]
    .slice(0, 30);

  const payload = {
    dateKey,
    dateLabel: String(body.dateLabel || spotlightDateLabel()).slice(0, 48),
    generatedAt: new Date().toISOString(),
    person: {
      name: person.name,
      achievement: person.achievement,
      article: person.article,
      whyNow: person.whyNow,
      location: person.location,
      field: person.field,
      imageUrl: person.imageUrl || null,
      videoId: person.videoId || null,
      sources: person.sources,
    },
    recentNames,
  };
  await setHumanSpotlight(env.AGENTS, payload);
  return json({
    ok: true,
    dateKey: payload.dateKey,
    name: person.name,
    hasVideo: Boolean(person.videoId),
  });
};
