/**
 * Share Tagline Writer. Every few days, asks Grok for one fresh share tagline
 * per STATIC surface (quiz, students, week, topics, votes) — the line a
 * reader's post carries when they share that page — and stores the map in KV
 * via the Worker. Per-article share text comes from the report pipeline
 * instead (broadcast.ts share_text); this agent only covers the surfaces that
 * have no per-item generation.
 *
 * The Worker validates every tagline through filterShareTag (length, no
 * emoji/hashtags/exclamations, no grade/score/lean leaks — hooks render in
 * anonymous HTML) and merges per key, so a rejected value keeps the previous
 * tagline rather than blanking a ShareBar hook.
 */
import { getShareTags, setShareTags } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
// Short-copy generation doesn't need the premium reasoning model.
const MODEL = "grok-4.20-0309-non-reasoning";

const SURFACES = ["quiz", "students", "week", "topics", "votes"];

const INTENTS = {
  quiz: "reader shares the daily 5-claim news quiz (may ask ONE genuine question)",
  students:
    "reader shares the plain-language student explainer board (audience: 16-24, first news habit)",
  week: "reader shares the weekly best/worst coverage review (evergreen phrasing, no specific week)",
  topics: "generic: must read naturally on ANY topic page (Iran, the NBA, AI — do not name one)",
  votes: "reader shares the anonymous community consensus board (reader picks, not polls)",
};

const SYSTEM = `You write one share tagline per surface for CladFacts, a fact-checking news site that grades news broadcasts. Each tagline is the text a READER posts on X/Threads when sharing that page — something a thoughtful 16-24-year-old is proud to post. Voice: restrained broadsheet, confident, specific. Catchy means CONCRETE — a real number, a real stake, a real tension — never hype.

HARD RULES per tagline:
- 60-160 characters; one or two sentences.
- No emoji, hashtags, exclamation marks, or ALL CAPS.
- No letter grades, scores, or political-lean labels (the card image carries those).
- No slang-chasing; no "click/see/check out"; no question-bait — except the quiz, which may ask one genuine question.
- NEVER include a calendar date — taglines live for days.
- Round live numbers DOWN to a clean floor and phrase as a minimum ("more than 1,200 ballots locked"), never an exact count that will go stale.
- Use provided live numbers where given.
You are given the current taglines; write fresh ones, do not repeat them.

Return ONLY JSON: { "tags": { "quiz": "...", "students": "...", "week": "...", "topics": "...", "votes": "..." } }`;

const SCHEMA = {
  type: "object",
  properties: {
    tags: {
      type: "object",
      properties: Object.fromEntries(SURFACES.map((s) => [s, { type: "string" }])),
      required: SURFACES,
      additionalProperties: false,
    },
  },
  required: ["tags"],
  additionalProperties: false,
};

export async function runShareTagWriter() {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY not set" };

  // Current pool + live context (anonymous aggregates) from the Worker.
  let current = {};
  let context = {};
  try {
    const r = await getShareTags();
    if (r.ok) {
      current = r.body?.data?.tags || {};
      context = r.body?.context || {};
    }
  } catch {
    /* context is optional */
  }

  const user = JSON.stringify({
    surfaces: INTENTS,
    currentTaglines: current,
    liveContext: context,
  });

  let tags;
  try {
    const res = await fetch(XAI_RESPONSES, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${xaiKey}` },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
        text: { format: { type: "json_schema", name: "sharetags", schema: SCHEMA, strict: true } },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`xAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const data = await res.json();
    const text = extractText(data);
    if (!text) throw new Error("xAI returned no text");
    tags = JSON.parse(text)?.tags;
  } catch (err) {
    return { ok: false, message: `generate failed: ${String(err?.message || err).slice(0, 160)}` };
  }
  if (!tags || typeof tags !== "object") return { ok: false, message: "no tags generated" };

  const out = await setShareTags(tags);
  if (!out.ok) return { ok: false, message: `store failed ${out.status}` };
  const stored = Object.keys(out.body?.tags || {});
  return { ok: true, message: `taglines refreshed: ${stored.join(", ") || "none accepted"}` };
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
