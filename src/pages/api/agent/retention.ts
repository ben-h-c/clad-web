import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";

export const prerender = false;

/**
 * Scheduled data-retention prune (B2/B3/B5).
 *
 * - Expired Better Auth sessions (ip/UA not retained forever)
 * - Unsubscribed newsletter rows older than 30d; pending older than 7d
 * - Anonymous push tokens not refreshed in 180 days
 *
 * Body: { dryRun?: boolean }
 */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }

  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
  const dryRun = !!body.dryRun;
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  const counts: Record<string, number> = {};

  // B2: expired sessions
  {
    const cutoff = iso(now);
    if (dryRun) {
      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM session WHERE expiresAt < ?"
      )
        .bind(cutoff)
        .first<{ n: number }>();
      counts.expiredSessions = row?.n ?? 0;
    } else {
      const res = await env.DB.prepare("DELETE FROM session WHERE expiresAt < ?")
        .bind(cutoff)
        .run();
      counts.expiredSessions = res.meta?.changes ?? 0;
    }
  }

  // B3: newsletter retention
  {
    const unsubCutoff = iso(now - 30 * 86_400_000);
    const pendingCutoff = iso(now - 7 * 86_400_000);
    try {
      if (dryRun) {
        const u = await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM newsletter_subscriber WHERE status = 'unsubscribed' AND unsubscribedAt < ?"
        )
          .bind(unsubCutoff)
          .first<{ n: number }>();
        const p = await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM newsletter_subscriber WHERE status = 'pending' AND createdAt < ?"
        )
          .bind(pendingCutoff)
          .first<{ n: number }>();
        counts.newsletterUnsubscribed = u?.n ?? 0;
        counts.newsletterPending = p?.n ?? 0;
      } else {
        const u = await env.DB.prepare(
          "DELETE FROM newsletter_subscriber WHERE status = 'unsubscribed' AND unsubscribedAt < ?"
        )
          .bind(unsubCutoff)
          .run();
        const p = await env.DB.prepare(
          "DELETE FROM newsletter_subscriber WHERE status = 'pending' AND createdAt < ?"
        )
          .bind(pendingCutoff)
          .run();
        counts.newsletterUnsubscribed = u.meta?.changes ?? 0;
        counts.newsletterPending = p.meta?.changes ?? 0;
      }
    } catch {
      // Table may not exist yet on fresh DBs.
      counts.newsletterUnsubscribed = 0;
      counts.newsletterPending = 0;
    }
  }

  // B5: stale anonymous push tokens (not refreshed in 180 days)
  {
    const tokenCutoff = iso(now - 180 * 86_400_000);
    try {
      if (dryRun) {
        const row = await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM push_token WHERE userId IS NULL AND updatedAt < ?"
        )
          .bind(tokenCutoff)
          .first<{ n: number }>();
        counts.staleAnonPushTokens = row?.n ?? 0;
      } else {
        const res = await env.DB.prepare(
          "DELETE FROM push_token WHERE userId IS NULL AND updatedAt < ?"
        )
          .bind(tokenCutoff)
          .run();
        counts.staleAnonPushTokens = res.meta?.changes ?? 0;
      }
    } catch {
      counts.staleAnonPushTokens = 0;
    }
  }

  return new Response(JSON.stringify({ ok: true, dryRun, counts }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
