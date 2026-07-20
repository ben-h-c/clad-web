/**
 * Social Sentiment Scanner. For each recently-published report it samples the
 * public's reaction to the story on social media platforms only (X, Facebook,
 * Instagram, Threads, TikTok, Bluesky, Reddit, YouTube comments, Truth Social)
 * via Grok's search tools and scores it on a signed -100..+100 axis,
 * independent of the report's own grade and political lean. News coverage,
 * blogs, and forums are never sentiment sources.
 * Results are stored in KV (one blob keyed by post id — see
 * src/lib/agents.ts) and rendered on article and topic pages. Sentiment is
 * living data: posts are re-scanned while the story is hot, then left alone.
 */
import { getPosts, getSentiments, putSentiments } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
// Search-grounded reasoning model — the same tier the grader uses. Sentiment
// is worthless without sampling real posts, so search is non-negotiable here.
const MODEL = "grok-4.3";

const VOLUMES = ["minimal", "low", "moderate", "high", "viral"];

// Only reactions from these platforms count as social sentiment. Anything else
// the model reports (news sites, blogs, forums) is dropped before storage.
const PLATFORM_ALIASES = new Map([
  ["x", "X"],
  ["twitter", "X"],
  ["x (twitter)", "X"],
  ["x (formerly twitter)", "X"],
  ["facebook", "Facebook"],
  ["fb", "Facebook"],
  ["instagram", "Instagram"],
  ["threads", "Threads"],
  ["tiktok", "TikTok"],
  ["bluesky", "Bluesky"],
  ["bsky", "Bluesky"],
  ["reddit", "Reddit"],
  ["youtube", "YouTube"],
  ["youtube comments", "YouTube"],
  ["truth social", "Truth Social"],
  ["mastodon", "Mastodon"],
]);

const SCHEMA = {
  type: "object",
  properties: {
    sentiment_score: { type: "integer", minimum: -100, maximum: 100 },
    summary: { type: "string" },
    volume: { type: "string", enum: VOLUMES },
    platforms: { type: "array", items: { type: "string" } },
  },
  required: ["sentiment_score", "summary", "volume", "platforms"],
  additionalProperties: false,
};

const SYSTEM = `You are the social-media desk of "Clad," a fact-checking publication. Your job is to measure how the PUBLIC is reacting to a news story on social media platforms ONLY — X, Facebook, Instagram, Threads, TikTok, Bluesky, Reddit, YouTube comments, Truth Social — NOT to judge the story yourself. Use search to sample real, current reactions to the story (and to this specific broadcast of it where discussion exists) before answering.

Only posts and comments written by the public on those platforms are sentiment sources. News articles, editorials, op-eds, blogs, forums, and comment sections on news sites are NOT: they may help you locate the story, but the score, summary, volume, and platforms must be built exclusively from social-platform reactions. If search surfaces only news coverage and no social-platform reactions, treat it as no reactions found.

Return a single JSON object:
{
  "sentiment_score": <integer -100 to 100>,
  "summary": "<one or two sentences on the prevailing reaction>",
  "volume": "minimal" | "low" | "moderate" | "high" | "viral",
  "platforms": ["<platform sampled>", ...]
}

"sentiment_score": the overall valence of the public reaction. -100 = overwhelmingly negative/hostile (outrage, ridicule, alarm), 0 = mixed or evenly divided, +100 = overwhelmingly positive/celebratory. Use the full range and be precise (e.g. -35 for clearly-negative-but-not-furious). Measure the crowd, not your own view, and not the story's objective merits — a well-reported story can still be received with fury, and vice versa. Be even-handed: apply the same standard regardless of which political side the reaction comes from.

"summary": one or two factual sentences describing the reaction — what people are praising, mocking, disputing, or worried about, and whether reaction splits along partisan or other lines. Restrained editorial tone; no emoji; describe the crowd's words, don't adopt them.

"volume": how much discussion you actually found. "minimal" = you found almost none; "viral" = it is dominating feeds. If discussion is too sparse to characterize, use "minimal", set sentiment_score to 0, and say so plainly in the summary.

"platforms": the social platforms you actually sampled reactions from (e.g. "X", "Facebook", "Reddit"). Only platforms from the list above may appear. Empty array only if you found no reactions at all.

Do not fabricate reactions, quotes, or volume. Base everything on what search actually returned. Return ONLY the JSON object.`;

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  for (const item of data?.output || []) {
    for (const c of item?.content || []) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") return c.text;
    }
  }
  return "";
}

async function callGrok(xaiKey, user, tools) {
  const res = await fetch(XAI_RESPONSES, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${xaiKey}` },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      tools,
      text: { format: { type: "json_schema", name: "social_sentiment", schema: SCHEMA, strict: true } },
    }),
  });
  if (!res.ok) {
    const err = new Error(`xAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// x_search samples X directly (the richest reaction source); web_search covers
// Reddit/YouTube/forums. If the account/model tier rejects x_search, fall back
// to web_search alone rather than failing the whole scan.
let xSearchSupported = true;

async function scanPost(xaiKey, p) {
  const published = new Date(p.publishedAt);
  const user = [
    `Story headline: ${p.headline}`,
    p.videoTitle ? `Broadcast/video title: ${p.videoTitle}` : "",
    p.sourceTitle ? `Network/channel: ${p.sourceTitle}` : "",
    p.topics?.length ? `Topics: ${p.topics.join(", ")}` : "",
    `Published: ${Number.isNaN(published.getTime()) ? p.publishedAt : published.toUTCString()}`,
    "",
    "Sample the current reaction to this story on social media platforms only and score it.",
  ]
    .filter((l) => l !== "")
    .join("\n");

  let data;
  if (xSearchSupported) {
    try {
      data = await callGrok(xaiKey, user, [
        { type: "x_search", max_search_results: 8 },
        { type: "web_search", max_search_results: 4 },
      ]);
    } catch (err) {
      // 400/404/422 → the tool itself was refused; anything else is a real error.
      if (![400, 404, 422].includes(err.status)) throw err;
      xSearchSupported = false;
    }
  }
  if (!data) {
    data = await callGrok(xaiKey, user, [{ type: "web_search", max_search_results: 8 }]);
  }

  const parsed = JSON.parse(extractText(data));
  let score = Math.round(Number(parsed?.sentiment_score));
  if (!Number.isFinite(score)) throw new Error("no sentiment_score in response");
  score = Math.max(-100, Math.min(100, score));
  return {
    score,
    summary: String(parsed?.summary || "").trim().slice(0, 500),
    volume: VOLUMES.includes(parsed?.volume) ? parsed.volume : "low",
    platforms: [
      ...new Set(
        (Array.isArray(parsed?.platforms) ? parsed.platforms : [])
          .map((s) => PLATFORM_ALIASES.get(String(s || "").trim().toLowerCase()))
          .filter(Boolean)
      ),
    ].slice(0, 6),
    at: new Date().toISOString(),
  };
}

export async function runSentimentScanner(agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY not set" };

  const c = agent.config || {};
  const maxScans = c.maxScansPerRun || 10;
  const windowMs = (c.scanWindowDays || 10) * 24 * 60 * 60 * 1000;
  const refreshMs = (c.refreshHours || 24) * 60 * 60 * 1000;
  const refreshWindowMs = (c.refreshWindowHours || 72) * 60 * 60 * 1000;

  const res = await getPosts();
  if (!res.ok) return { ok: false, message: `posts fetch ${res.status}` };
  const posts = res.body.posts || [];

  let map = {};
  const cur = await getSentiments();
  if (cur.ok) map = cur.body.sentiments || {};

  const now = Date.now();
  const ageOf = (iso) => now - new Date(iso).getTime();
  const recent = posts.filter((p) => {
    const age = ageOf(p.publishedAt);
    return Number.isFinite(age) && age >= 0 && age <= windowMs;
  });

  // Unscanned posts first (newest first); then hot posts whose sentiment has
  // gone stale — reaction to a fresh story keeps moving for a couple of days.
  const missing = recent
    .filter((p) => !map[p.id])
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  const stale = recent
    .filter((p) => map[p.id] && ageOf(map[p.id].at) >= refreshMs && ageOf(p.publishedAt) <= refreshWindowMs)
    .sort((a, b) => new Date(map[a.id].at) - new Date(map[b.id].at));
  const batch = [...missing, ...stale].slice(0, maxScans);

  if (batch.length === 0) {
    return { ok: true, message: `all ${recent.length} recent posts current — nothing to scan`, submitted: 0 };
  }

  const updates = {};
  let failed = 0;
  let lastErr = "";
  for (const p of batch) {
    try {
      updates[p.id] = await scanPost(xaiKey, p);
    } catch (err) {
      failed++;
      lastErr = String(err?.message || err).slice(0, 120);
    }
  }

  const scanned = Object.keys(updates).length;
  if (scanned > 0) {
    const out = await putSentiments(updates, posts.map((p) => p.id));
    if (!out.ok) return { ok: false, message: `sentiment put ${out.status}` };
  }
  if (scanned === 0) return { ok: false, message: `all ${batch.length} scans failed: ${lastErr}` };

  return {
    ok: true,
    submitted: scanned,
    skipped: failed,
    message:
      `scanned ${scanned}/${batch.length} (${missing.length} new, ${stale.length} stale queued)` +
      (failed ? ` — ${failed} failed: ${lastErr}` : ""),
  };
}
