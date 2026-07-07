import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { buildDigest } from "~/lib/digest";
import { sendEmail, emailConfigured } from "~/lib/email";

export const prerender = false;

const DAY = 86_400_000;
const MAX_SEND_PER_RUN = 100;

interface Row {
  userId: string;
  prefs: string;
  email: string;
  name: string | null;
  createdAt: string;
  lastSentAt: string | null;
  subStatus: string | null;
  subEnd: string | null;
}

// Hybrid access model: every signed-in account has the full scoreboard, and
// digests only go to account holders — so grades always render in the email.
function showGradesFor(_row: Row, _now: number): boolean {
  return true;
}

function isDue(cadence: string, lastSentAt: string | null, now: number): boolean {
  if (!lastSentAt) return true;
  const elapsed = now - new Date(lastSentAt).getTime();
  return cadence === "daily" ? elapsed >= 20 * 3_600_000 : elapsed >= 6.5 * DAY;
}

export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const dryRun = !!body.dryRun;
  const force = !!body.force;
  const testTo = typeof body.testTo === "string" ? body.testTo.trim() : "";

  if (!emailConfigured()) return json({ error: "Email (Resend) is not configured." }, 503);

  const posts = (await getCollection("posts", (p) => !p.data.draft)).sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf()
  );
  const now = Date.now();

  // Test/preview: render a sample (top stories, grades on) for one address.
  if (testTo) {
    const sample = buildDigest({ posts, followed: [], showGrades: true, sinceMs: now - 8 * DAY });
    if (!sample) return json({ ok: false, reason: "no recent posts to preview" });
    if (dryRun) return json({ ok: true, preview: true, subject: sample.subject, count: sample.count, html: sample.html });
    const ok = await sendEmail(testTo, `[Test] ${sample.subject}`, sample.html);
    return json({ ok, test: true, to: testTo, count: sample.count });
  }

  const res = await env.DB.prepare(
    `SELECT up.userId AS userId, up.prefs AS prefs, u.email AS email, u.name AS name,
            u.createdAt AS createdAt, ds.lastSentAt AS lastSentAt,
            s.status AS subStatus, s.currentPeriodEnd AS subEnd
     FROM user_preferences up
     JOIN user u ON u.id = up.userId
     LEFT JOIN digest_send ds ON ds.userId = up.userId
     LEFT JOIN subscription s ON s.userId = up.userId
     WHERE json_extract(up.prefs, '$.digest') IN ('daily','weekly')`
  ).all<Row>();
  const rows = res.results ?? [];

  // Followed topics for all candidates in one pass.
  const followedBy = new Map<string, string[]>();
  if (rows.length) {
    const ph = rows.map(() => "?").join(",");
    const al = await env.DB.prepare(
      `SELECT userId, topic FROM topic_alert WHERE userId IN (${ph})`
    )
      .bind(...rows.map((r) => r.userId))
      .all<{ userId: string; topic: string }>();
    for (const a of al.results ?? []) {
      if (!followedBy.has(a.userId)) followedBy.set(a.userId, []);
      followedBy.get(a.userId)!.push(a.topic);
    }
  }

  let due = 0,
    sent = 0,
    skippedEmpty = 0,
    failed = 0;

  for (const row of rows) {
    let cadence = "weekly";
    try {
      const p = JSON.parse(row.prefs || "{}");
      cadence = p.digest === "daily" ? "daily" : "weekly";
    } catch {
      /* default weekly */
    }
    if (!force && !isDue(cadence, row.lastSentAt, now)) continue;
    due++;
    if (sent >= MAX_SEND_PER_RUN) break;

    const sinceMs = now - (cadence === "daily" ? 1.5 * DAY : 8 * DAY);
    const digest = buildDigest({
      posts,
      followed: followedBy.get(row.userId) ?? [],
      showGrades: showGradesFor(row, now),
      sinceMs,
      name: row.name ?? undefined,
    });
    if (!digest) {
      skippedEmpty++;
      continue; // nothing new this period — try again next run
    }
    if (dryRun) {
      sent++;
      continue;
    }
    const ok = await sendEmail(row.email, digest.subject, digest.html);
    if (ok) {
      sent++;
      await env.DB.prepare(
        `INSERT INTO digest_send (userId, lastSentAt, updatedAt) VALUES (?, ?, ?)
         ON CONFLICT(userId) DO UPDATE SET lastSentAt = excluded.lastSentAt, updatedAt = excluded.updatedAt`
      )
        .bind(row.userId, new Date(now).toISOString(), new Date(now).toISOString())
        .run();
    } else {
      failed++;
    }
  }

  return json({ ok: true, candidates: rows.length, due, sent, skippedEmpty, failed, dryRun });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
