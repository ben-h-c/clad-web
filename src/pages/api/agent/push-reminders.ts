import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getCalendarEventsStore } from "~/lib/agents";
import { todayIsoNy } from "~/lib/calendarEvents";
import { apnsConfigured, sendEventPush } from "~/lib/push";

export const prerender = false;

/**
 * Morning / evening calendar push reminders for the iOS app.
 *
 * Body (optional):
 *  - mode: "today" | "tomorrow" (default: today in morning hours, else tomorrow)
 *  - dryRun: boolean
 *  - force: boolean — send even if we already notified this date key today
 *
 * Dedupes via KV key `push:event-reminder:<dateKey>` so each civil day only
 * gets one "today" and one "tomorrow" ping per device fleet.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }

  if (!(await apnsConfigured())) {
    return json({ ok: false, reason: "APNs not configured" }, 503);
  }

  const body = (await request.json().catch(() => ({}))) as {
    mode?: string;
    dryRun?: boolean;
    force?: boolean;
  };
  const dryRun = !!body.dryRun;
  const force = !!body.force;

  const today = todayIsoNy();
  const tomorrow = shiftIso(today, 1);
  // Default: morning (UTC 11–16 ≈ ET 6–11) → today; later → tomorrow preview.
  const hourUtc = new Date().getUTCHours();
  const defaultMode = hourUtc >= 11 && hourUtc < 17 ? "today" : "tomorrow";
  const mode = body.mode === "today" || body.mode === "tomorrow" ? body.mode : defaultMode;
  const targetDate = mode === "today" ? today : tomorrow;

  const dedupeKey = `push:event-reminder:${mode}:${targetDate}`;
  if (!force) {
    const already = await env.AGENTS.get(dedupeKey);
    if (already) {
      return json({ ok: true, skipped: true, reason: "already sent", mode, targetDate, prior: already });
    }
  }

  const store = await getCalendarEventsStore(env.AGENTS);
  const events = (store?.events ?? [])
    .filter((e) => e.date === targetDate)
    .filter((e) => e.kind !== "clad")
    .slice(0, 8);

  if (events.length === 0) {
    return json({ ok: true, skipped: true, reason: "no events", mode, targetDate });
  }

  const titles = events.map((e) => e.title).filter(Boolean);
  const head = titles[0]!;
  const more = titles.length - 1;
  const when = mode === "today" ? "Today" : "Tomorrow";
  const title = `CladFacts · ${when} on the calendar`;
  const bodyText =
    more > 0
      ? `${head} · +${more} more national item${more === 1 ? "" : "s"}`
      : head;

  if (dryRun) {
    return json({
      ok: true,
      dryRun: true,
      mode,
      targetDate,
      title,
      body: bodyText,
      eventCount: events.length,
      events: titles,
    });
  }

  const result = await sendEventPush({
    title,
    body: bodyText.slice(0, 180),
    path: "/",
  });

  await env.AGENTS.put(
    dedupeKey,
    JSON.stringify({ at: new Date().toISOString(), sent: result.sent, events: titles.slice(0, 5) }),
    { expirationTtl: 60 * 60 * 36 } // ~1.5 days
  );

  return json({
    ok: true,
    mode,
    targetDate,
    title,
    body: bodyText,
    eventCount: events.length,
    push: result,
  });
};

function shiftIso(iso: string, days: number): string {
  const t = Date.parse(`${iso}T12:00:00.000Z`);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
