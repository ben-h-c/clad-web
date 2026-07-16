import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { sendEmail, emailConfigured } from "~/lib/email";
import {
  upsertPending,
  confirmByToken,
  unsubscribeByToken,
  validEmail,
} from "~/lib/subscribers";

export const prerender = false;

const SITE = "https://cladfacts.com";

/**
 * Public newsletter signup (no account required). Double opt-in:
 *   POST {email}            → pending row + confirmation email
 *   GET  ?confirm=<token>   → activates the subscription
 *   GET  ?u=<token>         → unsubscribes
 * Exempted from the editor basic-auth wall in src/middleware.ts and
 * rate-limited per IP so it can't be used as an email cannon.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!emailConfigured()) {
    return json({ error: "Signups are temporarily unavailable." }, 503);
  }

  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    clientAddress ||
    "unknown";
  if (env.FACTCHECK_LIMITER) {
    const { success } = await env.FACTCHECK_LIMITER.limit({ key: `subscribe:${ip}` });
    if (!success) {
      return json({ error: "Too many attempts. Try again in a minute." }, 429, {
        "Retry-After": "60",
      });
    }
  }

  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const email = String(p?.email ?? "").trim().toLowerCase();
  if (!validEmail(email)) return json({ error: "Enter a valid email address." }, 400);

  const sub = await upsertPending(email);
  // Already confirmed → don't re-send; reply identically so the endpoint
  // can't be used to probe which addresses are on the list.
  if (sub.status === "pending") {
    const link = `${SITE}/api/subscribe?confirm=${sub.token}`;
    await sendEmail(
      email,
      "Confirm your CladFacts subscription",
      `<p>You (or someone using this address) asked for the CladFacts weekly newsletter — ` +
        `the week's fact-checked headlines, every Sunday, free.</p>` +
        `<p><a href="${link}">Confirm my subscription</a></p>` +
        `<p>Or paste this link into your browser:<br>${link}</p>` +
        `<p>If this wasn't you, ignore this email and nothing will be sent.</p>`
    );
  }
  return json({ ok: true, message: "Check your inbox to confirm your subscription." });
};

export const GET: APIRoute = async ({ url }) => {
  const confirm = url.searchParams.get("confirm");
  const unsub = url.searchParams.get("u");
  if (confirm) {
    const ok = await confirmByToken(confirm);
    return page(
      ok ? "You're on the list" : "Link expired",
      ok
        ? "Your subscription is confirmed — the weekly CladFacts review lands on Sundays."
        : "This confirmation link is no longer valid. Sign up again from the home page."
    );
  }
  if (unsub) {
    const ok = await unsubscribeByToken(unsub);
    return page(
      ok ? "Unsubscribed" : "Link expired",
      ok
        ? "You won't receive the CladFacts newsletter again. Changed your mind? Sign up any time from the home page."
        : "This unsubscribe link is no longer valid."
    );
  }
  return json({ error: "Not found" }, 404);
};

function page(title: string, body: string): Response {
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex">` +
    `<title>${title} — CladFacts</title></head>` +
    `<body style="margin:0;background:#f5edd9;font-family:Georgia,serif;color:#1a140d">` +
    `<div style="max-width:520px;margin:12vh auto 0;padding:2rem;background:#fffdf6;border:1px solid #e6ddcb;text-align:center">` +
    `<div style="font-weight:700;font-size:1.8rem;letter-spacing:.18em">CLAD</div>` +
    `<h1 style="font-size:1.3rem;margin:1.2rem 0 .6rem">${title}</h1>` +
    `<p style="line-height:1.5">${body}</p>` +
    `<p style="margin-top:1.6rem"><a href="${SITE}/" style="color:#961e14">← Back to the front page</a></p>` +
    `</div></body></html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}
