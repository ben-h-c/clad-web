/**
 * Data retention prune — sessions, newsletter rows, stale anon push tokens.
 * Hits POST /api/agent/retention.
 */
import { call } from "./api.mjs";

export async function runRetentionPrune(agent) {
  const dryRun = Boolean(agent?.config?.dryRun);
  const res = await call("/api/agent/retention", {
    method: "POST",
    body: JSON.stringify({ dryRun }),
  });
  if (!res.ok) {
    return {
      ok: false,
      message: `retention failed: ${res.status} ${JSON.stringify(res.body).slice(0, 160)}`,
    };
  }
  const c = res.body?.counts || {};
  return {
    ok: true,
    message: `retention${dryRun ? " (dry)" : ""}: sessions ${c.expiredSessions ?? 0}, nl-unsub ${c.newsletterUnsubscribed ?? 0}, nl-pending ${c.newsletterPending ?? 0}, push ${c.staleAnonPushTokens ?? 0}`,
    submitted: 0,
  };
}
