import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getTodayInHistory, setTodayInHistory } from "~/lib/agents";
import { isCommonsMediaUrl } from "~/lib/politicianPhotos";
import {
  historyDateKey,
  historyDateLabel,
  normalizeHistoryItem,
} from "~/lib/todayInHistory";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** GET — current payload + desk date key (for the agent). */
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const store = await getTodayInHistory(env.AGENTS);
  return json({
    store,
    dateKey: historyDateKey(),
    dateLabel: historyDateLabel(),
  });
};

/**
 * POST — replace today's history pack.
 * Body: { dateKey, dateLabel?, items: [{ year, title, body, imageUrl?, videoId? }] }
 */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  let body: {
    dateKey?: string;
    dateLabel?: string;
    items?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const dateKey = String(body.dateKey || historyDateKey()).trim();
  if (!/^\d{2}-\d{2}$/.test(dateKey)) {
    return json({ error: "invalid dateKey" }, 400);
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .map(normalizeHistoryItem)
    .filter((x): x is NonNullable<typeof x> => x != null)
    .slice(0, 5)
    .map((it) => ({
      year: it.year,
      title: it.title,
      body: it.body,
      imageUrl:
        it.imageUrl && isCommonsMediaUrl(it.imageUrl) ? it.imageUrl : null,
      videoId: it.videoId || null,
    }));

  if (!items.length) {
    return json({ error: "items required (1–5)" }, 400);
  }

  const payload = {
    dateKey,
    dateLabel: String(body.dateLabel || historyDateLabel()).slice(0, 40),
    generatedAt: new Date().toISOString(),
    items,
  };
  await setTodayInHistory(env.AGENTS, payload);
  return json({
    ok: true,
    count: items.length,
    withVideo: items.filter((i) => i.videoId).length,
    dateKey: payload.dateKey,
  });
};
