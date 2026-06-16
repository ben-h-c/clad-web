/**
 * Shared "newsroom" classifier. Both curators reuse a small per-post judgment
 * (category, broad topic, lighthearted flag, 0-100 criticality) scored by Grok
 * and cached in KV, so they self-adjust to whatever is published without any
 * hand-maintained keyword lists. If Grok is unavailable, callers fall back to
 * the heuristics exported here, so the feeds never stall.
 */
import { getClassifications, putClassifications } from "./api.mjs";
import { canonicalTopic } from "../scripts/topicsAgg.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";

// ---- heuristic fallback (used only when Grok is unavailable) ----
const HEAVY_POLITICS =
  /\b(?:trump|biden|obama|harris|vance|newsom|desantis|pence|gowdy|warnock|schiff|clinton|mamdani|starmer|presiden\w*|congress\w*|senat\w*|lawmaker\w*|legislat\w*|filibuster|shutdown|impeach\w*|administration|white house|cabinet|governor|mayor\w*|attorney general|election\w*|midterm\w*|primary|primaries|ballot\w*|voter\w*|caucus\w*|campaign\w*|polls?|democrat\w*|republican\w*|gop|bipartisan|doj|fbi|cia|dhs|supreme court|scotus|federal court|lawsuit\w*|indict\w*|ruling|subpoena\w*|immigrat\w*|immigrant\w*|border|deport\w*|visa|migrant\w*|asylum|abortion|guns?|firearm\w*|iran\w*|israel\w*|gaza|hamas|hezbollah|idf|netanyahu|ukrain\w*|russia\w*|putin|zelensky|kremlin|china|chinese|taiwan|beijing|tariff\w*|sanction\w*|federal reserve|inflation|recession|nato|g7|g20|summit|foreign policy|diplomac\w*|geopolit\w*|wars?|military|missile\w*|airstrike\w*|troops|nuclear|genocide|protest\w*|riot\w*|terror\w*|coup|regime|parliament\w*|prime minister|dni|nominat\w*|hearing|probe|policy|policies|regulat\w*|agenc\w*|oversight|forest service|national forest\w*|mining|federal)\b/i;
const TRAGEDY =
  /\b(?:crash\w*|dead|dies|died|death\w*|deadly|fatal\w*|kill\w*|homicide|shoot\w*|gunman|gunmen|massacre|stabbing|stabbed|wildfire\w*|flood\w*|hurricane\w*|tornado\w*|earthquake\w*|tsunami|disaster\w*|catastroph\w*|victim\w*|tragedy|tragic|collaps\w*|explos\w*|bomb\w*|injur\w*|wound\w*|casualt\w*|outbreak\w*|pandemic|epidemic|overdose\w*|missing|manhunt|abduct\w*|kidnap\w*|assault\w*)\b/i;

function blobOf(p) {
  return `${(p.topics || []).join(" ")} ${p.headline || ""}`;
}
export function heuristicLighthearted(p) {
  const b = blobOf(p);
  return !HEAVY_POLITICS.test(b) && !TRAGEDY.test(b);
}

// Talk-show / panel / roundtable / commentary detection. The show name lives in
// the video's upload title (the headline rarely names it), so weight that.
const TALK_SHOW =
  /fox & friends|fox and friends|\bthe five\b|gutfeld|ingraham|\bhannity\b|jesse watters|\bwatters\b|outnumbered|faulkner|america'?s newsroom|fox news sunday|sunday morning futures|life,? liberty|next revolution|media ?buzz|the ?big ?weekend|\bthe view\b|the daily show|jon stewart|bill maher|real time|last week tonight|morning joe|deadline ?white house|the reidout|the beat with|\bvelshi\b|all in with|all-?in (podcast|pod)|rachel maddow|the weekend|meet the press|face the nation|state of the union|this week with|washington week|cnn this morning|anderson cooper|\bac ?360\b|news ?night|the lead with|inside politics|smerconish|\bcuomo\b|\bkudlow\b|primetime|the story with|special report|reliable sources|town ?hall|round ?table|\bpanel\b|talk show|full episode|reacts? to/i;
function talkBlobOf(p) {
  return `${p.videoTitle || ""} ${p.headline || ""} ${(p.topics || []).join(" ")} ${p.sourceTitle || ""}`;
}
export function heuristicTalkShow(p) {
  return TALK_SHOW.test(talkBlobOf(p));
}

/**
 * Front-page eligible = it's a news-media talk show / panel / roundtable /
 * commentary segment (Fox & Friends, The Five, The View, Morning Joe, Real Time,
 * The Daily Show, etc.) — across any network, including late-night political.
 */
export function frontPageEligible(p, map) {
  const c = map[p.id];
  if (c && typeof c.isTalkShow === "boolean") return c.isTalkShow;
  return heuristicTalkShow(p);
}
export function heuristicCriticality(p) {
  const b = blobOf(p);
  if (TRAGEDY.test(b)) return 80;
  if (HEAVY_POLITICS.test(b)) return 65;
  return 35;
}
/** Classification for a post, preferring the Grok cache, else heuristics. */
export function classOf(p, map) {
  const c = map[p.id];
  if (c) {
    // Older cached entries predate isTalkShow — fall back to the heuristic.
    return { ...c, isTalkShow: typeof c.isTalkShow === "boolean" ? c.isTalkShow : heuristicTalkShow(p) };
  }
  return {
    category: heuristicLighthearted(p) ? "other" : "politics",
    broadTopic: canonicalTopic(p.topics?.[0] || p.headline || "") || "misc",
    lighthearted: heuristicLighthearted(p),
    criticality: heuristicCriticality(p),
    isTalkShow: heuristicTalkShow(p),
    at: "",
  };
}

const CATEGORIES = [
  "politics", "world", "business", "tech", "science",
  "sports", "culture", "health", "tragedy", "other",
];

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer" },
          category: { type: "string", enum: CATEGORIES },
          broadTopic: { type: "string" },
          lighthearted: { type: "boolean" },
          criticality: { type: "integer", minimum: 0, maximum: 100 },
          isTalkShow: { type: "boolean" },
        },
        required: ["i", "category", "broadTopic", "lighthearted", "criticality", "isTalkShow"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const SYSTEM = `You are the desk editor of a news fact-checking site, classifying short video reports. For EACH numbered item return:
- "category": one of politics, world, business, tech, science, sports, culture, health, tragedy, other.
- "broadTopic": a short, canonical label to GROUP related stories (1-3 words). Reuse the same plain name across stories about the same subject (e.g. "Iran", "SpaceX", "World Cup 2026", "Federal Reserve", "NBA"). This is used to avoid showing too many stories on one subject.
- "lighthearted": true for any broadly-appealing, NON-political, non-tragic story suitable for a "cool recent stories" front page — sports, entertainment/culture, consumer tech and AI, gadgets, space, science/discovery, notable company/market/deal news (IPOs, big product or business moves), and human interest. It does NOT have to be funny or trivial — an interesting, substantive tech/space/business story still counts. false for politics, government/policy, elections, courts, geopolitics, war, crime, disasters, deaths, public-health crises, or anything heavy/somber.
- "criticality": integer 0-100 for how important/impactful this is AS BREAKING NEWS right now. Guide: major geopolitical events, wars, attacks, disasters with casualties, market-moving or major national policy news, deaths of major public figures = 80-100; significant national/world news = 55-79; routine politics/business/regional news = 35-54; soft/entertainment/human-interest/novelty = 5-34. Judge the inherent magnitude of the story, not its recency.
- "isTalkShow": true if this is a segment/clip from a news-media TALK SHOW, panel, roundtable, morning show, or opinion/commentary program — including late-night political comedy. Examples: Fox & Friends, The Five, Outnumbered, Gutfeld!, Hannity, Jesse Watters Primetime, The Ingraham Angle, America's Newsroom, Fox News Sunday, The View, This Week, Good Morning America panels, Morning Joe, Deadline: White House, The ReidOut, Meet the Press, Face the Nation, CNN This Morning, Anderson Cooper 360 panels, State of the Union, Washington Week, Real Time with Bill Maher, The Daily Show (Jon Stewart), Last Week Tonight. Use the VIDEO TITLE (the upload/show name) as the strongest signal — the headline usually won't name the show. false for straight news packages, single-anchor read reports, raw press conferences, or interviews that aren't part of a panel/commentary show.

Return ONLY JSON: { "items": [ { "i": <number>, "category": ..., "broadTopic": ..., "lighthearted": ..., "criticality": ..., "isTalkShow": ... } ] }. Include every item exactly once.`;

async function classifyBatch(xaiKey, batch) {
  const user =
    "Classify these reports:\n" +
    batch
      .map(
        (p, i) =>
          `${i}. ${p.headline}` +
          (p.videoTitle ? `  [video: ${p.videoTitle}]` : "") +
          (p.topics?.length ? `  [topics: ${p.topics.join(", ")}]` : "")
      )
      .join("\n");

  const res = await fetch(XAI_RESPONSES, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${xaiKey}` },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      text: { format: { type: "json_schema", name: "classifications", schema: SCHEMA, strict: true } },
    }),
  });
  if (!res.ok) throw new Error(`xAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  const text = extractText(data);
  if (!text) throw new Error("xAI returned no text");
  const parsed = JSON.parse(text);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const out = {};
  for (const it of items) {
    const p = batch[it.i];
    if (!p) continue;
    out[p.id] = {
      category: CATEGORIES.includes(it.category) ? it.category : "other",
      broadTopic: String(it.broadTopic || "").trim() || canonicalTopic(p.topics?.[0] || p.headline || "") || "misc",
      lighthearted: Boolean(it.lighthearted),
      criticality: Math.max(0, Math.min(100, Math.round(Number(it.criticality) || 0))),
      isTalkShow: Boolean(it.isTalkShow),
      at: new Date().toISOString(),
    };
  }
  return out;
}

/**
 * Return a full classification map for `posts` (keyed by post id). Reads the
 * shared cache, classifies any posts not yet cached (newest first, capped per
 * run to bound cost), writes the merge back, and prunes entries for posts that
 * no longer exist. Always resolves — on any error it returns whatever cache it
 * has; callers use classOf() which falls back to heuristics for the rest.
 */
export async function ensureClassifications(posts, { xaiKey, maxNew = 50, log } = {}) {
  let cache = {};
  try {
    const r = await getClassifications();
    if (r.ok) cache = r.body.classifications || {};
  } catch {
    // ignore — treat as empty cache
  }

  const missing = posts.filter((p) => !cache[p.id]);
  if (missing.length && xaiKey) {
    missing.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    const batch = missing.slice(0, maxNew);
    try {
      const fresh = await classifyBatch(xaiKey, batch);
      cache = { ...cache, ...fresh };
      await putClassifications(fresh, posts.map((p) => p.id));
      log?.(`newsroom: classified ${Object.keys(fresh).length} new (of ${missing.length} missing)`);
    } catch (err) {
      log?.(`newsroom: classify failed (${String(err?.message || err).slice(0, 120)}) — using heuristics`);
    }
  }
  return cache;
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
