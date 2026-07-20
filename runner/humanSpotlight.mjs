/**
 * Human Spotlight — daily positive human-interest piece for the homepage.
 * Grok + web_search picks one living person doing something great and writes
 * a short article. New person each America/New_York calendar day.
 */
import { getHumanSpotlight, putHumanSpotlight } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";
const UA = "CladFactsBot/1.0 (https://cladfacts.com; human-spotlight)";

const SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    achievement: { type: "string" },
    article: { type: "string" },
    whyNow: { type: "string" },
    location: { type: "string" },
    field: { type: "string" },
    wikiTitle: {
      type: "string",
      description:
        "English Wikipedia article title for a free-licensed lead image, or empty string",
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
        },
        required: ["title", "url"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "name",
    "achievement",
    "article",
    "whyNow",
    "location",
    "field",
    "wikiTitle",
    "sources",
  ],
  additionalProperties: false,
};

const SYSTEM = `You are the "Human Spotlight" desk for CladFacts — a fact-checking newspaper that also
runs a daily positive feature about a REAL living person doing something great.

Using web search, find ONE living human (not a company, brand, pet, or fictional character)
who has recently done something clearly positive, constructive, or uplifting — e.g. science
or medical breakthroughs, community service, rescue, education, arts that help people,
conservation, kindness at scale, disability advocacy, mutual aid, or similar.

HARD RULES:
- Pick a NEW person not on the "do not repeat" list the user provides.
- Prefer recent (last ~12 months) verifiable achievements over celebrity gossip.
- No invented people, awards, or stats. Every concrete claim must be grounded in search.
- Avoid pure partisan campaign spin, crime sensationalism, tragedy-as-porn, or "hate watches."
- Do not pick heads of state or sitting presidents unless the story is clearly a non-political
  humanitarian or scientific act (prefer ordinary or lesser-known people when possible).
- Name must be a real individual's full name as commonly published.
- article: 3–5 short paragraphs (about 250–450 words total), broadsheet voice — warm but not
  gushy, no exclamation marks, no hashtags, no emoji. Tell who they are, what they did, and
  why it matters. Separate paragraphs with blank lines (\\n\\n).
- achievement: one tight headline line (≤120 chars).
- whyNow: one sentence on why this person is timely today.
- location: city/region/country if known, else empty string.
- field: one short tag (science, health, community, arts, environment, education, sports, other).
- wikiTitle: English Wikipedia page title for a free image if one exists; else empty string.
- sources: 2–5 real https URLs you found (news or institutional pages). Never invent URLs.
  If you cannot find two real sources, pick a different person.

Return ONLY JSON matching the schema.`;

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  for (const item of data?.output || []) {
    for (const c of item?.content || []) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") {
        return c.text;
      }
    }
  }
  return "";
}

function isCommonsUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === "upload.wikimedia.org" &&
      u.pathname.startsWith("/wikipedia/commons/")
    );
  } catch {
    return false;
  }
}

async function commonsThumbForWikiTitle(title) {
  const t = String(title || "").trim();
  if (!t) return null;
  try {
    const r = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, "_"))}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.type === "disambiguation") return null;
    const src = j?.thumbnail?.source;
    return src && isCommonsUrl(src) ? src : null;
  } catch {
    return null;
  }
}

function deskDateParts() {
  const now = new Date();
  const long = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
  // en-CA → YYYY-MM-DD
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  const dateKey = y && m && d ? `${y}-${m}-${d}` : now.toISOString().slice(0, 10);
  return { dateKey, dateLabel: long };
}

async function callGrok(xaiKey, user) {
  const res = await fetch(XAI_RESPONSES, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${xaiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      tools: [{ type: "web_search", max_search_results: 8 }],
      text: {
        format: {
          type: "json_schema",
          name: "human_spotlight",
          schema: SCHEMA,
          strict: true,
        },
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`xAI ${res.status}: ${t.slice(0, 240)}`);
  }
  const data = await res.json();
  const text = extractText(data);
  if (!text) throw new Error("empty Grok response");
  return JSON.parse(text);
}

function sanitizeSources(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list) {
    const title = String(s?.title || "").trim().slice(0, 120);
    const url = String(s?.url || "").trim();
    if (!title || !/^https:\/\//i.test(url)) continue;
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") continue;
      out.push({ title, url: u.href.slice(0, 500) });
    } catch {
      /* skip */
    }
    if (out.length >= 6) break;
  }
  return out;
}

export async function runHumanSpotlight(agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY missing" };

  const force = Boolean(agent?.config?.force);
  const { dateKey, dateLabel } = deskDateParts();

  const existing = await getHumanSpotlight();
  const store = existing.ok ? existing.body?.store : null;
  if (store?.dateKey === dateKey && store?.person?.name && !force) {
    return {
      ok: true,
      message: `already fresh for ${dateLabel}: ${store.person.name}`,
      submitted: 0,
      skipped: 1,
    };
  }

  const recentNames = Array.isArray(store?.recentNames)
    ? store.recentNames.map((n) => String(n || "").trim()).filter(Boolean)
    : store?.person?.name
      ? [store.person.name]
      : [];

  let result;
  try {
    result = await callGrok(
      xaiKey,
      [
        `Desk date: ${dateLabel} (${dateKey}, America/New_York).`,
        `Find ONE living person doing something great and positive right now (or very recently).`,
        `Write a Human Spotlight article for CladFacts homepage readers.`,
        recentNames.length
          ? `Do NOT pick any of these recent spotlights (pick someone new):\n- ${recentNames.join("\n- ")}`
          : `No recent skip-list — any suitable living person is fine.`,
        `Use web search. Ground every fact. Return real source URLs.`,
      ].join("\n")
    );
  } catch (err) {
    return { ok: false, message: String(err?.message || err).slice(0, 280) };
  }

  const name = String(result?.name || "").trim().slice(0, 80);
  const achievement = String(result?.achievement || "").trim().slice(0, 160);
  const article = String(result?.article || "").trim().slice(0, 4000);
  if (!name || !achievement || article.length < 80) {
    return { ok: false, message: "model returned incomplete person/article" };
  }
  if (recentNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
    return { ok: false, message: `model repeated recent name: ${name}` };
  }

  let imageUrl = null;
  const wikiTitle = String(result?.wikiTitle || "").trim();
  if (wikiTitle) imageUrl = await commonsThumbForWikiTitle(wikiTitle);

  const sources = sanitizeSources(result?.sources);
  if (sources.length < 1) {
    // Soft fail — still publish if the piece is solid; prefer sources when present
  }

  const person = {
    name,
    achievement,
    article,
    whyNow: String(result?.whyNow || "").trim().slice(0, 200) || undefined,
    location: String(result?.location || "").trim().slice(0, 80) || undefined,
    field: String(result?.field || "").trim().slice(0, 40) || undefined,
    imageUrl: imageUrl || null,
    sources: sources.length ? sources : undefined,
  };

  const put = await putHumanSpotlight({
    dateKey,
    dateLabel,
    person,
    recentNames: [name, ...recentNames].slice(0, 30),
  });
  if (!put.ok) {
    return {
      ok: false,
      message: `store failed: ${put.status} ${JSON.stringify(put.body).slice(0, 140)}`,
    };
  }

  return {
    ok: true,
    message: `${dateLabel}: ${name}${imageUrl ? " (photo)" : ""}${sources.length ? ` · ${sources.length} sources` : ""}`,
    submitted: 1,
    skipped: 0,
  };
}
