/**
 * Quip Writer. Every few days, asks Grok for a fresh batch of witty one-liners
 * for the for-fun ticker under the Front Page, merges them into a rolling pool
 * (deduped, capped), and stores it in KV. Light, self-aware roasts of doom-
 * scrolling — no politics, no targeting real people.
 */
import { getQuips, setQuips } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
// One-liner generation doesn't need the premium reasoning model.
const MODEL = "grok-4.20-0309-non-reasoning";

const SYSTEM = `You write short, witty one-liner "quips" for a fun scrolling ticker at the very bottom of CladFacts, a news fact-checking site. The vibe: self-aware and cheeky, gently roasting the reader for doomscrolling and reminding them not to take the news (or themselves) too seriously. Think dry, absurd, a little nihilistic, but warm — never mean.

Example of the tone: "Go touch some grass, none of this really matters to you."

Rules for EACH quip:
- 4 to 16 words, punchy, lowercase or sentence case (no ALL CAPS).
- PG-13: no profanity, slurs, or crude sexual content.
- NO politics, parties, ideologies, elections, or partisan jabs.
- Do NOT name or target real people, companies, or groups.
- No hate, no doom about real tragedies — keep it light and universal.
- Varied: mix gentle roasts, absurd observations, fake-wise advice, and meta jokes about reading the news.

Return ONLY JSON: { "quips": ["...", "..."] } with unique quips.`;

const SCHEMA = {
  type: "object",
  properties: {
    quips: { type: "array", items: { type: "string" } },
  },
  required: ["quips"],
  additionalProperties: false,
};

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export async function runQuipWriter(agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY not set" };

  const c = agent.config || {};
  const count = c.quipCount || 30;
  const maxPool = c.maxQuipPool || 120;

  let fresh;
  try {
    fresh = await generate(xaiKey, count);
  } catch (err) {
    return { ok: false, message: `generate failed: ${String(err?.message || err).slice(0, 160)}` };
  }
  if (!fresh.length) return { ok: false, message: "no quips generated" };

  // Merge newest-first into the existing pool, dedupe, cap.
  let existing = [];
  try {
    const r = await getQuips();
    if (r.ok) existing = r.body?.data?.quips || [];
  } catch {
    // ignore
  }
  const seen = new Set();
  const merged = [];
  for (const q of [...fresh, ...existing]) {
    const key = norm(q);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(q);
    if (merged.length >= maxPool) break;
  }

  const out = await setQuips(merged);
  if (!out.ok) return { ok: false, message: `store failed ${out.status}` };
  return {
    ok: true,
    message: `quips: +${fresh.length} new, pool ${merged.length}`,
    submitted: fresh.length,
  };
}

async function generate(xaiKey, count) {
  const res = await fetch(XAI_RESPONSES, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${xaiKey}` },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Write ${count} fresh, distinct quips.` },
      ],
      text: { format: { type: "json_schema", name: "quips", schema: SCHEMA, strict: true } },
    }),
  });
  if (!res.ok) throw new Error(`xAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  const text = extractText(data);
  if (!text) throw new Error("xAI returned no text");
  const parsed = JSON.parse(text);
  const list = Array.isArray(parsed?.quips) ? parsed.quips : [];
  return list
    .map((q) => String(q ?? "").trim())
    .filter((q) => q.length >= 3 && q.length <= 140)
    .slice(0, count);
}

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") return c.text;
    }
  }
  return null;
}
