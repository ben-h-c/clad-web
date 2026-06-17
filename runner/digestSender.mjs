/**
 * News Digest sender. Thin runner agent — the actual work (selecting opted-in
 * users, composing per-reader digests, emailing via Resend, tracking last-sent)
 * lives in the Worker at /api/agent/digest, which has D1 + Resend. We just ping
 * it on schedule; the endpoint decides who's due (daily vs weekly).
 */
import { runDigest } from "./api.mjs";

export async function runDigestSender() {
  const res = await runDigest();
  if (!res.ok) {
    return { ok: false, message: `digest endpoint ${res.status}: ${JSON.stringify(res.body).slice(0, 160)}` };
  }
  const b = res.body || {};
  return {
    ok: true,
    submitted: b.sent || 0,
    message: `${b.sent || 0} sent / ${b.due || 0} due of ${b.candidates || 0} subscribers (${b.skippedEmpty || 0} no-new, ${b.failed || 0} failed)`,
  };
}
