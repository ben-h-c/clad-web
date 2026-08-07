/**
 * Push reminder agent — calendar daybook + evening desk digest for iOS.
 * Hits POST /api/agent/push-reminders.
 *
 * Cron: 12:30 UTC (morning ET) → marquee "today" calendar.
 *       23:30 UTC (evening ET) → digest of grades that skipped lock-screen
 *                                + optional passive "tomorrow" marquee.
 */
import { call } from "./api.mjs";

export async function runPushReminders(agent) {
  const mode = agent?.config?.mode; // optional force "today" | "tomorrow" | "digest" | "auto"
  const force = Boolean(agent?.config?.force);
  const body = { force };
  if (
    mode === "today" ||
    mode === "tomorrow" ||
    mode === "digest" ||
    mode === "auto"
  ) {
    body.mode = mode;
  }

  const res = await call("/api/agent/push-reminders", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return {
      ok: false,
      message: `push-reminders failed: ${res.status} ${JSON.stringify(res.body).slice(0, 160)}`,
    };
  }
  const b = res.body || {};
  if (b.skipped) {
    return {
      ok: true,
      message: `skipped (${b.reason || "n/a"}) · ${b.mode || "?"} ${b.targetDate || ""}`,
      submitted: 0,
    };
  }

  if (b.mode === "digest" || b.digest) {
    const d = b.digest || {};
    const t = b.tomorrowCalendar?.push || {};
    return {
      ok: true,
      message: `digest sent ${d.sent ?? 0}/${d.recipients ?? 0} (${d.reason || "ok"}) · tomorrow cal ${t.sent ?? 0}`.slice(
        0,
        280
      ),
      submitted: (d.sent ?? 0) + (t.sent ?? 0),
    };
  }

  const p = b.push || {};
  return {
    ok: true,
    message: `event push ${b.mode} ${b.targetDate}: sent ${p.sent ?? 0}/${p.recipients ?? 0} · ${b.reason || b.body || ""}`.slice(
      0,
      280
    ),
    submitted: p.sent ?? 0,
  };
}
