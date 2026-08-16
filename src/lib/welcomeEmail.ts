/**
 * First-time welcome — sent after email verification (or on create if the
 * provider already verified the address). Copy is the approved founder note.
 */
import { env } from "cloudflare:workers";
import { WELCOME_SUBJECT, welcomeEmailHtml } from "./welcomeLetter.ts";

export { WELCOME_SUBJECT, welcomeEmailHtml };

const SENT_PREFIX = "welcome-sent:";

/** Send once per user. Failures must never block auth. */
export async function sendWelcomeEmail(user: {
  id?: string | null;
  email?: string | null;
  name?: string | null;
}): Promise<void> {
  const to = String(user.email || "").trim();
  const id = String(user.id || "").trim();
  if (!to || !env.RESEND_API_KEY) return;

  const kv = env.AGENTS;
  const sentKey = id ? SENT_PREFIX + id : "";
  if (kv && sentKey) {
    try {
      if (await kv.get(sentKey)) return;
    } catch {
      /* send anyway */
    }
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "CladFacts <noreply@cladfacts.com>",
      to,
      subject: WELCOME_SUBJECT,
      html: welcomeEmailHtml(user.name),
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}`);
  }
  if (kv && sentKey) {
    try {
      await kv.put(sentKey, new Date().toISOString());
    } catch {
      /* next attempt may resend once — acceptable */
    }
  }
}
