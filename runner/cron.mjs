import parser from "cron-parser";

/**
 * Is this agent due? True when the most recent scheduled fire time is at or
 * after the last successful run (or there's no last run yet). Cron is
 * interpreted in UTC to match the console's stated timezone.
 */
export function isDue(cron, lastRunAt, now = new Date()) {
  if (!lastRunAt) return true; // never run → fire now
  let interval;
  try {
    interval = parser.parseExpression(cron, { currentDate: now, tz: "UTC" });
  } catch {
    return false; // bad cron → don't run (surface via save-time validation)
  }
  const prevFire = interval.prev().toDate();
  return prevFire.getTime() > new Date(lastRunAt).getTime();
}
