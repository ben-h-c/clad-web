/** Transactional email via Resend. No-ops (returns false) when unconfigured. */
import { env } from "cloudflare:workers";

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: "CladFacts <noreply@cladfacts.com>", to, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function emailConfigured(): boolean {
  return !!env.RESEND_API_KEY;
}
