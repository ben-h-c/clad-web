/**
 * Good News Curator. The brighter-side counterpart to the Discover Curator.
 * Reads recent published reports, keeps only the positive / uplifting /
 * genuinely interesting ones (using the shared newsroom classifier's
 * "lighthearted" signal — sports, science, space, tech, business wins, culture,
 * human interest; never politics, war, crime, disasters or tragedy), then asks
 * Grok to group them into a handful of warm, themed collections. Result is
 * stored in KV and rendered on the Premium-only /good-news page, which is laid
 * out identically to /discover.
 */
import { getPosts, setGoodNews } from "./api.mjs";
import { ensureClassifications, classOf } from "./newsroom.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
// Reasoning model — like Discover, it needs genuine creativity to find warm
// throughlines and invent fresh, specific collection titles.
const MODEL = "grok-4.20-0309-reasoning";

const SYSTEM = `You are CladFacts's "Good News" editor. From the numbered reports below — all already pre-screened as positive, uplifting, or genuinely interesting (NOT grim) — group them into a few warm, inviting themed collections a reader would enjoy browsing when they want a break from heavy news.

Rules:
- Invent 3-6 collections. Group by an UPBEAT theme, tone, or throughline (e.g. "Breakthroughs & Discoveries", "Comebacks & Big Wins", "Wonder & Curiosity", "Quietly Good for the World", "People Helping People", "Made You Smile"). The titles above only convey the desired tone — write your OWN, fresh and specific to THESE reports, each time.
- Each collection needs:
  - "title": a punchy, inviting angle you INVENT YOURSELF (max ~42 chars), specific to these reports.
  - "blurb": one short sentence (max ~120 chars) naming what makes these a bright spot.
  - "items": 2-6 report indices that share that upbeat throughline.
- Each report appears in AT MOST one collection. Use ONLY the provided indices.
- Every item MUST plainly match the collection's stated title and blurb — a reader scanning the title should never be surprised by an item. If a report does not clearly fit any collection theme, leave it OUT; never pad a collection to reach the minimum.
- Keep it genuinely positive. If a report is actually somber, divisive, or grim, leave it out rather than forcing it in.

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

// Second-pass collection-fit check. A cheap non-reasoning call (like the quip
// writer's model) looks at each proposed collection's title + blurb + member
// headlines and returns only the indices that plainly match the stated theme.
const VERIFY_MODEL = "grok-4.20-0309-non-reasoning";

const VERIFY_SYSTEM = `You are a strict quality checker for CladFacts's "Good News" page. Below are proposed collections, each with a stated title, a blurb, and its member reports (index + headline). For each collection, keep ONLY the reports that plainly match the collection's stated title and blurb — a reader scanning the title should never be surprised by an item. Drop anything off-theme, only loosely related, or not genuinely positive. It is fine (and expected) to drop items; do not keep a bad fit to preserve collection size.

Return ONLY JSON: { "sections": [ { "index": number, "keep": [number] } ] } — one entry per collection, where "index" is the collection number shown below and "keep" lists the report indices to retain.`;

const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          keep: { type: "array", items: { type: "integer" } },
        },
        required: ["index", "keep"],
        additionalProperties: false,
      },
    },
  },
  required: ["sections"],
  additionalProperties: false,
};

/**
 * Returns a Map of collection index -> Set of kept report indices. Throws on
 * any API/parse failure — the caller falls back to the unverified sections so
 * the page never stalls on this pass.
 */
async function verifySections(xaiKey, proposed, pool) {
  const user = proposed
    .map((s, si) => {
      const items = (s?.items || [])
        .map((idx) => {
          const p = pool[Number(idx)];
          return p ? `  ${idx}. ${p.headline}` : null;
        })
        .filter(Boolean)
        .join("\n");
      return `Collection ${si}: "${String(s?.title || "").trim()}" — ${String(s?.blurb || "").trim()}\n${items}`;
    })
    .join("\n\n");

  const r = await fetch(XAI_RESPONSES, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${xaiKey}` },
    body: JSON.stringify({
      model: VERIFY_MODEL,
      input: [
        { role: "system", content: VERIFY_SYSTEM },
        { role: "user", content: user },
      ],
      text: { format: { type: "json_schema", name: "goodnews_verify", schema: VERIFY_SCHEMA, strict: true } },
    }),
  });
  if (!r.ok) throw new Error(`xAI ${r.status}`);
  const parsed = JSON.parse(extractText(await r.json()));
  const keep = new Map();
  for (const s of parsed?.sections || []) {
    keep.set(Number(s?.index), new Set((s?.keep || []).map(Number)));
  }
  return keep;
}

export async function runGoodNewsCurator(agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY not set" };

  const c = agent.config || {};
  const maxSections = c.maxSections || 6;
  const poolSize = c.poolSize || 120;

  const res = await getPosts();
  if (!res.ok) return { ok: false, message: `posts fetch ${res.status}` };
  const all = res.body.posts || [];
  if (all.length < 4) return { ok: true, message: `only ${all.length} posts — skipped`, submitted: 0 };

  // Most-recent first, then keep only the positive / interesting (lighthearted)
  // ones via the shared classifier. Heuristics fill in for anything uncached so
  // the feed never stalls when Grok is unavailable.
  const recent = [...all].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  const classMap = await ensureClassifications(recent, { xaiKey, maxNew: 50 });
  const pool = recent
    .filter((p) => {
      const cls = classOf(p, classMap);
      return cls.lighthearted && cls.category !== "tragedy" && cls.category !== "politics";
    })
    .slice(0, poolSize);

  if (pool.length < 4) {
    return { ok: true, message: `only ${pool.length} positive posts — skipped`, submitted: 0 };
  }

  const user =
    "Reports:\n" +
    pool
      .map((p, i) => `${i}. ${p.headline}` + (p.topics?.length ? `  [${p.topics.join(", ")}]` : ""))
      .join("\n");

  let data;
  try {
    const r = await fetch(XAI_RESPONSES, {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${xaiKey}` },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
        text: { format: { type: "json_schema", name: "goodnews", schema: SCHEMA, strict: true } },
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

  // Second pass: verify every item plainly fits its collection's stated theme.
  // On any failure fall back to the unverified sections — the page must not
  // stall because the checker call broke.
  let keepBySection = null;
  try {
    keepBySection = await verifySections(xaiKey, parsed?.sections || [], pool);
  } catch {
    keepBySection = null;
  }

  const used = new Set();
  const sections = [];
  for (const [si, s] of (parsed?.sections || []).entries()) {
    const title = String(s?.title || "").trim().slice(0, 60);
    if (!title) continue;
    const keep = keepBySection?.get(si);
    const ids = [];
    for (const idx of s?.items || []) {
      const n = Number(idx);
      if (keep && !keep.has(n)) continue;
      const p = pool[n];
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

  const out = await setGoodNews(sections);
  if (!out.ok) return { ok: false, message: `good-news set ${out.status}` };

  return {
    ok: true,
    submitted: sections.length,
    message: `${sections.length} collections, ${used.size} articles: ${sections.map((s) => s.title).join(" · ")}`,
  };
}
