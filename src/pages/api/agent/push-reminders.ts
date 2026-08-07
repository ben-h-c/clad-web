import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getCalendarEventsStore } from "~/lib/agents";
import { todayIsoNy } from "~/lib/calendarEvents";
import {
  apnsConfigured,
  sendEventPush,
  sendPendingDigestPush,
} from "~/lib/push";
import { isMarqueeCalendarTitle } from "~/lib/pushPolicy";

export const prerender = false;

/**
 * iOS push reminders — calendar daybook + evening desk digest.
 *
 * Body (optional):
 *  - mode: "today" | "tomorrow" | "digest" | "auto" (default auto)
 *  - dryRun: boolean
 *  - force: boolean — calendar only: ignore already-sent dedupe
 *
 * Auto schedule (agent runs 12:30 & 23:30 UTC):
 *  - Morning window → marquee "today" calendar (if any)
 *  - Evening window → passive "tomorrow" marquee OR desk digest of grades
 *    that did not earn a lock-screen alert
 *
 * Policy: never spam. Calendar requires marquee titles; digest is passive.
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

  const hourUtc = new Date().getUTCHours();
  // 11–17 UTC ≈ morning ET; else evening/night.
  const isMorning = hourUtc >= 11 && hourUtc < 17;

  let mode: "today" | "tomorrow" | "digest" | "auto" =
    body.mode === "today" ||
    body.mode === "tomorrow" ||
    body.mode === "digest" ||
    body.mode === "auto"
      ? body.mode
      : "auto";

  if (mode === "auto") {
    mode = isMorning ? "today" : "digest";
  }

  // --- Evening desk digest (grades that skipped lock-screen) ---
  if (mode === "digest") {
    if (dryRun) {
      const day = todayIsoNy();
      const raw = await env.AGENTS.get(`push:digest-queue:${day}`);
      let items: unknown[] = [];
      try {
        items = raw ? JSON.parse(raw) : [];
      } catch {
        items = [];
      }
      return json({
        ok: true,
        dryRun: true,
        mode: "digest",
        queued: Array.isArray(items) ? items.length : 0,
        items,
      });
    }
    const digest = await sendPendingDigestPush();
    // Also try a passive tomorrow calendar if marquee items exist and we have budget.
    const tomorrowPush = await maybeCalendar("tomorrow", dryRun, force);
    return json({
      ok: true,
      mode: "digest",
      digest,
      tomorrowCalendar: tomorrowPush,
    });
  }

  // --- Calendar daybook ---
  return json(await maybeCalendar(mode, dryRun, force));
};

async function maybeCalendar(
  mode: "today" | "tomorrow",
  dryRun: boolean,
  force: boolean
) {
  const today = todayIsoNy();
  const tomorrow = shiftIso(today, 1);
  const targetDate = mode === "today" ? today : tomorrow;

  const dedupeKey = `push:event-reminder:${mode}:${targetDate}`;
  if (!force) {
    const already = await env.AGENTS.get(dedupeKey);
    if (already) {
      return {
        ok: true,
        skipped: true,
        reason: "already sent",
        mode,
        targetDate,
        prior: already,
      };
    }
  }

  const store = await getCalendarEventsStore(env.AGENTS);
  const events = (store?.events ?? [])
    .filter((e) => e.date === targetDate)
    .filter((e) => e.kind !== "clad")
    .slice(0, 12);

  if (events.length === 0) {
    return { ok: true, skipped: true, reason: "no events", mode, targetDate };
  }

  const titles = events.map((e) => e.title).filter(Boolean);
  const marquee = titles.filter(isMarqueeCalendarTitle);
  if (marquee.length === 0) {
    return {
      ok: true,
      skipped: true,
      reason: "no_marquee_events",
      mode,
      targetDate,
      eventCount: events.length,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      mode,
      targetDate,
      marquee,
      eventCount: events.length,
      events: titles,
    };
  }

  const result = await sendEventPush({
    mode,
    titles,
    path: "/",
  });

  if (result.sent > 0 || result.reason === "daily_calendar_cap") {
    await env.AGENTS.put(
      dedupeKey,
      JSON.stringify({
        at: new Date().toISOString(),
        sent: result.sent,
        events: marquee.slice(0, 5),
        reason: result.reason,
      }),
      { expirationTtl: 60 * 60 * 36 }
    );
  }

  return {
    ok: true,
    mode,
    targetDate,
    marquee,
    eventCount: events.length,
    push: result,
  };
}

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
