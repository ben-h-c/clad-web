/**
 * Weekly newsletter sender. Thin runner agent — the work (selecting opted-in
 * users, composing the editorial week-in-review, emailing via Resend, tracking
 * last-sent) lives in the Worker at /api/agent/newsletter. We ping it weekly.
 */
import { runNewsletter } from "./api.mjs";

export async function runNewsletterSender() {
  const res = await runNewsletter();
  if (!res.ok) {
    return { ok: false, message: `newsletter endpoint ${res.status}: ${JSON.stringify(res.body).slice(0, 160)}` };
  }
  const b = res.body || {};
  return {
    ok: true,
    submitted: b.sent || 0,
    message: `${b.sent || 0} sent / ${b.due || 0} due of ${b.candidates || 0} subscribers (${b.failed || 0} failed)`,
  };
}
