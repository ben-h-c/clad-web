import { putTrending } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";

const SCHEMA = {
  type: "object",
  properties: { topics: { type: "array", items: { type: "string" } } },
  required: ["topics"],
  additionalProperties: false,
};

const SYSTEM = `You are Clad's news desk. Using web search, identify the US news stories/topics
with the HIGHEST current public interest RIGHT NOW — across politics, government, the economy and
markets, business, technology, and major world events affecting the US. Return each as a SHORT
search-keyword phrase (2-4 words) suitable for a YouTube search, e.g. "SpaceX IPO", "Iran nuclear
deal", "Supreme Court ruling". Favor specific, currently-trending stories over evergreen themes.
Do not include explanations — just the phrases.`;

// Refresh the dynamic, public-interest topic list the YouTube scanner searches.
export async function runTrendingTopics(agent) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, message: "XAI_API_KEY not set" };
  const max = agent.config?.maxTopics || 15;

  let topics;
  try {
    const r = await fetch(XAI_RESPONSES, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `List the ${max} hottest topics to scan YouTube for today.` },
        ],
        tools: [{ type: "web_search" }],
        text: { format: { type: "json_schema", name: "topics", schema: SCHEMA, strict: true } },
      }),
    });
    if (!r.ok) return { ok: false, message: `xAI ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}` };
    const d = await r.json();
    let text = d.output_text;
    if (!text) {
      for (const it of d.output || []) for (const c of it.content || []) if (c.text) text = c.text;
    }
    if (!text) return { ok: false, message: "xAI returned no output text" };
    topics = (JSON.parse(text).topics || []).map((t) => String(t).trim()).filter(Boolean).slice(0, max);
  } catch (err) {
    return { ok: false, message: `trending fetch failed: ${String(err?.message || err).slice(0, 200)}` };
  }

  if (topics.length === 0) return { ok: false, message: "no topics returned" };

  const out = await putTrending(topics);
  if (!out.ok) return { ok: false, message: `store ${out.status}` };
  return { ok: true, message: `updated ${topics.length} trending topics: ${topics.slice(0, 6).join(", ")}…`, submitted: topics.length };
}
