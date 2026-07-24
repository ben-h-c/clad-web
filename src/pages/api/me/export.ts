import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getSessionUser, getPrefs, jsonResponse } from "~/lib/user-data";

export const prerender = false;

/**
 * GET /api/me/export — GDPR/CCPA-style data export for the signed-in user.
 * Session-scoped, rate-limited. Returns only the caller's rows.
 */
export const GET: APIRoute = async ({ request, clientAddress }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);

  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    clientAddress ||
    "unknown";
  if (env.FACTCHECK_LIMITER) {
    const { success } = await env.FACTCHECK_LIMITER.limit({ key: `export:${user.id}:${ip}` });
    if (!success) {
      return jsonResponse({ error: "Too many export requests. Try again later." }, 429);
    }
  }

  const prefs = await getPrefs(user.id);

  const [
    comments,
    favorites,
    alerts,
    subscription,
    appleSub,
    ballots,
    sessions,
    accounts,
    newsletter,
  ] = await Promise.all([
    env.DB.prepare(
      "SELECT id, postSlug, body, gradeVote, leanVote, createdAt, updatedAt FROM comment WHERE userId = ? ORDER BY updatedAt DESC LIMIT 2000"
    )
      .bind(user.id)
      .all(),
    env.DB.prepare("SELECT postSlug, createdAt FROM favorite WHERE userId = ?")
      .bind(user.id)
      .all()
      .catch(() => ({ results: [] })),
    env.DB.prepare("SELECT topic, createdAt FROM topic_alert WHERE userId = ?")
      .bind(user.id)
      .all()
      .catch(() => ({ results: [] })),
    env.DB.prepare(
      "SELECT status, currentPeriodEnd, stripeCustomerId, stripeSubscriptionId FROM subscription WHERE userId = ?"
    )
      .bind(user.id)
      .first()
      .catch(() => null),
    env.DB.prepare(
      "SELECT originalTransactionId, productId, status, expiresAt, updatedAt FROM apple_subscription WHERE userId = ?"
    )
      .bind(user.id)
      .first()
      .catch(() => null),
    env.DB.prepare(
      "SELECT id, shareSlug, displayName, createdAt, updatedAt FROM user_ballot WHERE userId = ?"
    )
      .bind(user.id)
      .all()
      .catch(() => ({ results: [] })),
    env.DB.prepare(
      "SELECT id, expiresAt, createdAt, updatedAt FROM session WHERE userId = ?"
    )
      .bind(user.id)
      .all()
      .catch(() => ({ results: [] })),
    env.DB.prepare(
      "SELECT id, providerId, accountId, createdAt FROM account WHERE userId = ?"
    )
      .bind(user.id)
      .all()
      .catch(() => ({ results: [] })),
    user.email
      ? env.DB.prepare(
          "SELECT email, status, createdAt, confirmedAt, unsubscribedAt FROM newsletter_subscriber WHERE lower(email) = lower(?)"
        )
          .bind(user.email)
          .first()
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const ballotRows = (ballots as { results?: { id: string }[] }).results ?? [];
  let picks: unknown[] = [];
  if (ballotRows.length) {
    const ids = ballotRows.map((b) => b.id).slice(0, 50);
    const ph = ids.map(() => "?").join(",");
    try {
      const res = await env.DB.prepare(
        `SELECT ballotId, raceId, side, createdAt FROM user_pick WHERE ballotId IN (${ph})`
      )
        .bind(...ids)
        .all();
      picks = res.results ?? [];
    } catch {
      picks = [];
    }
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    },
    preferences: prefs,
    comments: (comments as { results?: unknown[] }).results ?? [],
    favorites: (favorites as { results?: unknown[] }).results ?? [],
    topicAlerts: (alerts as { results?: unknown[] }).results ?? [],
    subscription: subscription ?? null,
    appleSubscription: appleSub ?? null,
    ballots: ballotRows,
    picks,
    sessions: ((sessions as { results?: unknown[] }).results ?? []).map((s: any) => ({
      id: s.id,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      // Omit ipAddress / userAgent from export payload of other sessions? Include for access right.
    })),
    accounts: (accounts as { results?: unknown[] }).results ?? [],
    newsletterSubscriber: newsletter ?? null,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="cladfacts-export-${user.id.slice(0, 8)}.json"`,
    },
  });
};
