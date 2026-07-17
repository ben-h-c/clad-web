import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import {
  getCalendarEventsStore,
  mergeCalendarEvents,
  type StoredCalendarEvent,
} from "~/lib/agents";
import { normalizeCalendarEvent } from "~/lib/calendarEvents";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** GET — current calendar store for the scanner (merge context). */
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const store = await getCalendarEventsStore(env.AGENTS);
  return json({
    store: store ?? { updatedAt: null, events: [] },
    today: new Date().toISOString().slice(0, 10),
  });
};

/**
 * POST — merge scanned events (upcoming scheduled + historical majors).
 * Body: { events: [...], summary?: string, maxStored?: number }
 */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  let body: {
    events?: unknown;
    summary?: string;
    maxStored?: number;
    replaceAgent?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!Array.isArray(body.events)) {
    return json({ error: "events array required" }, 400);
  }

  const normalized: StoredCalendarEvent[] = [];
  for (const raw of body.events.slice(0, 80)) {
    const e = normalizeCalendarEvent(raw, "agent");
    if (!e) continue;
    normalized.push({
      id: e.id,
      date: e.date,
      title: e.title,
      body: e.body,
      kind: e.kind,
      state: e.state,
      links: e.links,
      raceId: e.raceId,
      source: "agent",
      updatedAt: e.updatedAt || new Date().toISOString(),
    });
  }

  const store = await mergeCalendarEvents(env.AGENTS, normalized, {
    summary: body.summary,
    maxStored: typeof body.maxStored === "number" ? body.maxStored : undefined,
    // Scanner runs replace prior agent rows so a tighter bar drops niche leftovers.
    replaceAgent: body.replaceAgent !== false,
  });

  return json({
    ok: true,
    merged: normalized.length,
    total: store.events.length,
    updatedAt: store.updatedAt,
  });
};
