import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { sendEmail, emailConfigured } from "~/lib/email";
import { WELCOME_SUBJECT, welcomeEmailHtml } from "~/lib/welcomeEmail";

export const prerender = false;

/** Preview/test only — never fans out to the user list. */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  if (!emailConfigured()) return json({ error: "Email (Resend) is not configured." }, 503);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const testTo = typeof body.testTo === "string" ? body.testTo.trim() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo)) {
    return json({ error: "testTo required" }, 400);
  }
  const name = typeof body.name === "string" ? body.name : "Ben";
  const html = welcomeEmailHtml(name);
  if (body.dryRun) return json({ ok: true, preview: true, subject: WELCOME_SUBJECT });

  const ok = await sendEmail(testTo, `[Test] ${WELCOME_SUBJECT}`, html);
  return json({ ok, test: true, to: testTo });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
