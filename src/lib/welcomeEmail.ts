/**
 * First-time welcome — sent after email verification (or on create if the
 * provider already verified the address). Copy is the approved founder note.
 */
import { env } from "cloudflare:workers";
import { EMAIL, emailShell, escHtml } from "./emailTheme.ts";

const SITE = (env.BETTER_AUTH_URL || "https://cladfacts.com").replace(/\/$/, "");
const SENT_PREFIX = "welcome-sent:";

export const WELCOME_SUBJECT = "Welcome to CladFacts — the news, not the spin";

function firstName(name?: string | null): string {
  const n = String(name || "").trim().split(/\s+/)[0] || "";
  return n;
}

export function welcomeEmailHtml(name?: string | null): string {
  const greeting = firstName(name) ? `Hi ${escHtml(firstName(name))},` : "Hi,";
  const p = `margin:0 0 14px;font:400 15px/1.6 ${EMAIL.font};color:${EMAIL.body}`;
  const ink = EMAIL.ink;
  const bodyInner =
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">` +
    `Thanks for joining. Here's why this exists, and what to do first.` +
    `</div>` +
    `<p style="${p}">${greeting}</p>` +
    `<p style="${p}">Thanks for signing up.</p>` +
    `<p style="${p}">` +
    `I built CladFacts because I was tired of being sold a story instead of the news. Mainstream coverage is full of spin: loaded headlines, missing context, and “reporting” that skips the part that would change what you think. I don’t want a team. I want the facts, the lean, and the nuance — then I can decide.` +
    `</p>` +
    `<p style="${p}">Clad’s job is simple:</p>` +
    `<ul style="margin:0 0 14px;padding:0 0 0 1.2em;font:400 15px/1.6 ${EMAIL.font};color:${EMAIL.body}">` +
    `<li style="margin:0 0 6px">Watch the broadcast.</li>` +
    `<li style="margin:0 0 6px">Grade it for accuracy.</li>` +
    `<li style="margin:0 0 6px">Mark the lean.</li>` +
    `<li style="margin:0">Call out what’s false, what’s one-sided, and what’s left out.</li>` +
    `</ul>` +
    `<p style="${p}">` +
    `A headline can be technically true and still be a lie of omission. That’s why every report has a letter grade, a why, and links back to the source. We’re not here to tell you who to vote for. We’re here so you can see when someone is trying to walk you there.` +
    `</p>` +
    `<p style="${p}">` +
    `Your account unlocks the scoreboard — grades, factuality, lean, and the rationale on every report. No card required.` +
    `</p>` +
    `<p style="${p}">` +
    `If you want the method first: ` +
    `<a href="${SITE}/how-it-works/" style="color:${EMAIL.accent};font-weight:600">How grading works</a>.` +
    `</p>` +
    `<p style="margin:18px 0 0;font:400 15px/1.6 ${EMAIL.font};color:${ink}">Glad you’re here.</p>` +
    `<p style="margin:4px 0 0;font:400 15px/1.55 ${EMAIL.font};color:${ink}">Ben<br>` +
    `<span style="color:${EMAIL.muted}">CladFacts</span></p>`;

  return emailShell({
    title: "Welcome",
    subtitle: "From Ben",
    body: `<tr><td style="padding:22px 28px 8px;background:${EMAIL.card}">${bodyInner}</td></tr>`,
    footerNote: "You’re getting this because you verified a CladFacts account.",
    ctaHref: `${SITE}/`,
    ctaLabel: "See today’s grades",
  });
}

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
