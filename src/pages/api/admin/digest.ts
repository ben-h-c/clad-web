import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { buildDigest } from "~/lib/digest";
import { sendEmail, emailConfigured } from "~/lib/email";

export const prerender = false;

const DAY = 86_400_000;

async function sample() {
  const posts = (await getCollection("posts", (p) => !p.data.draft)).sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf()
  );
  return buildDigest({ posts, followed: [], showGrades: true, sinceMs: Date.now() - 8 * DAY });
}

// Preview: opted-in count + a rendered sample digest.
export const GET: APIRoute = async () => {
  const c = await env.DB.prepare(
    "SELECT count(*) AS n FROM user_preferences WHERE json_extract(prefs,'$.digest') IN ('daily','weekly')"
  ).first<{ n: number }>();
  const d = await sample();
  return json({
    optedIn: c?.n ?? 0,
    emailConfigured: emailConfigured(),
    preview: d ? { subject: d.subject, count: d.count, html: d.html } : null,
  });
};

// Send a test digest to one address.
export const POST: APIRoute = async ({ request }) => {
  if (!emailConfigured()) return json({ error: "Email (Resend) is not configured." }, 503);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const to = String(body.to ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: "Enter a valid email." }, 400);
  const d = await sample();
  if (!d) return json({ error: "No recent posts to build a digest from." }, 400);
  const ok = await sendEmail(to, `[Test] ${d.subject}`, d.html);
  return json(ok ? { ok: true, to } : { error: "Resend rejected the send." }, ok ? 200 : 502);
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
