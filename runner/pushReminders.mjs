/**
 * Push reminder agent — daily calendar daybook pings to iOS devices.
 * Hits POST /api/agent/push-reminders (mode auto: today in morning, else tomorrow).
 */
import { call } from "./api.mjs";

export async function runPushReminders(agent) {
  const mode = agent?.config?.mode; // optional force "today" | "tomorrow"
  const force = Boolean(agent?.config?.force);
  const body = { force };
  if (mode === "today" || mode === "tomorrow") body.mode = mode;

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
  const p = b.push || {};
  return {
    ok: true,
    message: `event push ${b.mode} ${b.targetDate}: sent ${p.sent ?? 0}/${p.recipients ?? 0} · ${b.body || ""}`.slice(
      0,
      280
    ),
    submitted: p.sent ?? 0,
  };
}
