/**
 * Discover Curator. Reads recent published reports and asks Grok to invent a
 * handful of FRESH, serendipitous collections — offbeat angles a reader
 * wouldn't ordinarily see grouped (e.g. "Where Left & Right Quietly Agree",
 * "Buried Leads", "Numbers That Surprised Us"). Different each run. Cheap
 * non-reasoning model, no web search. Result is stored in KV and rendered on
 * the Premium-only /discover page.
 */
import { getPosts, setDiscover } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
// Reasoning model — this runs once a day and needs genuine creativity to find
// cross-topic throughlines and invent fresh angle titles (the non-reasoning
// tier either grouped by topic or parroted the example titles).
const MODEL = "grok-4.20-0309-reasoning";

const SYSTEM = `You are CladFacts's "Discover" editor. From the numbered news reports below, invent a set of FRESH, surprising thematic collections that a curious reader would not ordinarily see grouped together. Think like a magazine features editor finding hidden throughlines.

CRITICAL: A collection is a THEME, PATTERN, TONE, or IDEA that connects reports about DIFFERENT, UNRELATED stories — NOT a cluster of reports about the same event or subject.
- BAD (do NOT do this): grouping several reports that are all about Iran, or all about one plane crash, or all about a single election. That's just a topic.
- GOOD: a crash + a corporate merger + a court ruling grouped under "Unintended Consequences"; a tech IPO + a farm-bill vote + a sports deal under "Follow the Money"; stories where opposing sides landed in the same place under "Strange Bedfellows".

Rules:
- Invent 4-6 collections. Each MUST draw from at least 3 DISTINCT underlying stories/subjects. If reports share the same subject, they do NOT belong in the same collection.
- Each collection needs:
  - "title": a punchy, intriguing ANGLE you INVENT YOURSELF (max ~42 chars), specific to THESE reports. The following only convey the desired tone — using any of them verbatim is a failure: "Where Left & Right Quietly Agree", "Buried Leads", "Strange Bedfellows", "Follow the Money", "The Long Game". Write your own, fresh each time.
  - "blurb": one short sentence (max ~120 chars) naming the throughline.
  - "items": 3-6 report indices spanning different subjects that share that throughline.
- Each report appears in AT MOST one collection. Use ONLY the provided indices.
- Never use a subject as a title ("Iran", "the election", "the crash") — these are ANGLES, not topics.

Return ONLY JSON: { "sections": [ { "title": string, "blurb": string, "items": [number] } ] }`;

const SCHEMA = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          blurb: { type: "string" },
          items: { type: "array", items: { type: "integer" } },
        },
        required: ["title", "blurb", "items"],
        additionalProperties: false,
      },
    },
  },
  required: ["sections"],
  additionalProperties: false,
};

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  for (const item of data?.output || []) {
    for (const c of item?.content || []) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") return c.text;
    }
  }
  return "";
}

export async function runDiscoverCurator(agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY not set" };

  const c = agent.config || {};
  const maxSections = c.maxSections || 6;
  const poolSize = c.poolSize || 80;

  const res = await getPosts();
  if (!res.ok) return { ok: false, message: `posts fetch ${res.status}` };
  const all = res.body.posts || [];
  if (all.length < 6) return { ok: true, message: `only ${all.length} posts — skipped`, submitted: 0 };

  // Most-recent pool, capped to bound tokens.
  const pool = [...all]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, poolSize);

  const user =
    "Reports:\n" +
    pool
      .map((p, i) => `${i}. ${p.headline}` + (p.topics?.length ? `  [${p.topics.join(", ")}]` : ""))
      .join("\n");

  let data;
  try {
    const r = await fetch(XAI_RESPONSES, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${xaiKey}` },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
        text: { format: { type: "json_schema", name: "discover", schema: SCHEMA, strict: true } },
      }),
    });
    if (!r.ok) return { ok: false, message: `xAI ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}` };
    data = await r.json();
  } catch (e) {
    return { ok: false, message: `xAI error: ${String(e?.message || e).slice(0, 160)}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(extractText(data));
  } catch {
    return { ok: false, message: "xAI returned no valid JSON" };
  }

  const used = new Set();
  const sections = [];
  for (const s of parsed?.sections || []) {
    const title = String(s?.title || "").trim().slice(0, 60);
    if (!title) continue;
    const ids = [];
    for (const idx of s?.items || []) {
      const p = pool[Number(idx)];
      if (p && !used.has(p.id)) {
        used.add(p.id);
        ids.push(p.id);
      }
    }
    if (ids.length >= 2) {
      sections.push({ title, blurb: String(s?.blurb || "").trim().slice(0, 160), ids: ids.slice(0, 6) });
    }
    if (sections.length >= maxSections) break;
  }

  if (sections.length === 0) return { ok: false, message: "no usable sections produced" };

  const out = await setDiscover(sections);
  if (!out.ok) return { ok: false, message: `discover set ${out.status}` };

  return {
    ok: true,
    submitted: sections.length,
    message: `${sections.length} collections, ${used.size} articles: ${sections.map((s) => s.title).join(" · ")}`,
  };
}
