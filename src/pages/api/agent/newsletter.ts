import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { buildNewsletter } from "~/lib/newsletter";
import { sendEmail, emailConfigured } from "~/lib/email";
import { TRIAL_DAYS } from "~/lib/access";

export const prerender = false;

const DAY = 86_400_000;
const MAX_SEND_PER_RUN = 200;

interface Row {
  userId: string;
  email: string;
  name: string | null;
  createdAt: string;
  lastSentAt: string | null;
  subStatus: string | null;
  subEnd: string | null;
}

function isSubscriber(row: Row, now: number): boolean {
  const paid =
    (row.subStatus === "active" || row.subStatus === "trialing") &&
    (!row.subEnd || new Date(row.subEnd).getTime() > now);
  if (paid) return true;
  const created = row.createdAt ? new Date(row.createdAt).getTime() : now;
  return now < created + TRIAL_DAYS * DAY;
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
  const subForm = buildNewsletter({ posts, showGrades: true });
  const freeForm = buildNewsletter({ posts, showGrades: false });

  if (testTo) {
    if (!subForm) return json({ ok: false, reason: "no posts in the last week" });
    if (dryRun) return json({ ok: true, preview: true, subject: subForm.subject, count: subForm.count, html: subForm.html });
    const ok = await sendEmail(testTo, `[Test] ${subForm.subject}`, subForm.html);
    return json({ ok, test: true, to: testTo });
  }

  if (!subForm && !freeForm) return json({ ok: true, candidates: 0, due: 0, sent: 0, note: "no posts this week" });

  const res = await env.DB.prepare(
    `SELECT up.userId AS userId, u.email AS email, u.name AS name, u.createdAt AS createdAt,
            ns.lastSentAt AS lastSentAt, s.status AS subStatus, s.currentPeriodEnd AS subEnd
     FROM user_preferences up
     JOIN user u ON u.id = up.userId
     LEFT JOIN newsletter_send ns ON ns.userId = up.userId
     LEFT JOIN subscription s ON s.userId = up.userId
     WHERE json_extract(up.prefs, '$.newsletter') = 1`
  ).all<Row>();
  const rows = res.results ?? [];

  let due = 0,
    sent = 0,
    failed = 0;

  for (const row of rows) {
    const fresh = !row.lastSentAt || now - new Date(row.lastSentAt).getTime() >= 6.5 * DAY;
    if (!force && !fresh) continue;
    due++;
    if (sent >= MAX_SEND_PER_RUN) break;

    const form = isSubscriber(row, now) ? subForm : freeForm;
    if (!form) continue;
    if (dryRun) {
      sent++;
      continue;
    }
    const ok = await sendEmail(row.email, form.subject, form.html);
    if (ok) {
      sent++;
      await env.DB.prepare(
        `INSERT INTO newsletter_send (userId, lastSentAt, updatedAt) VALUES (?, ?, ?)
         ON CONFLICT(userId) DO UPDATE SET lastSentAt = excluded.lastSentAt, updatedAt = excluded.updatedAt`
      )
        .bind(row.userId, new Date(now).toISOString(), new Date(now).toISOString())
        .run();
    } else {
      failed++;
    }
  }

  return json({ ok: true, candidates: rows.length, due, sent, failed, dryRun });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
