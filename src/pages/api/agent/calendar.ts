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
 * Body: {
 *   events, summary?, maxStored?,
 *   replaceAgent?: boolean (full wipe of prior agent rows),
 *   replaceAgentInWindow?: { start, end } (YYYY-MM-DD) — preferred: only
 *     drop prior agent rows inside the scan window so density accumulates.
 * }
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
    replaceAgentInWindow?: { start?: string; end?: string };
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
  // Multi-pass scanners may send up to ~150 events per POST.
  for (const raw of body.events.slice(0, 150)) {
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

  const winStart = String(body.replaceAgentInWindow?.start || "").trim().slice(0, 10);
  const winEnd = String(body.replaceAgentInWindow?.end || "").trim().slice(0, 10);
  const hasWindow = /^\d{4}-\d{2}-\d{2}$/.test(winStart) && /^\d{4}-\d{2}-\d{2}$/.test(winEnd);

  const store = await mergeCalendarEvents(env.AGENTS, normalized, {
    summary: body.summary,
    maxStored: typeof body.maxStored === "number" ? body.maxStored : undefined,
    // Prefer windowed replace so multi-month density accumulates. Full wipe
    // only when the runner sets replaceAgent: true without a window.
    replaceAgent: body.replaceAgent === true && !hasWindow,
    replaceAgentInWindow: hasWindow ? { start: winStart, end: winEnd } : undefined,
  });

  return json({
    ok: true,
    merged: normalized.length,
    total: store.events.length,
    updatedAt: store.updatedAt,
  });
};
