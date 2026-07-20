/**
 * Today in History — daily pack of significant/interesting events that
 * occurred on this month-day in past years. Homepage fun facts.
 * Optional Wikimedia Commons thumbs + YouTube embeds (search API).
 */
import { getTodayInHistory, putTodayInHistory } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";
const UA = "CladFactsBot/1.0 (https://cladfacts.com; today-in-history)";
const YT_SEARCH = "https://www.googleapis.com/youtube/v3/search";
const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          year: { type: "number" },
          title: { type: "string" },
          body: { type: "string" },
          wikiTitle: {
            type: "string",
            description:
              "English Wikipedia article title for a free-licensed lead image, or empty string if none",
          },
          youtubeQuery: {
            type: "string",
            description:
              "Short YouTube search query to find a relevant archival or explainer video, or empty string",
          },
        },
        required: ["year", "title", "body", "wikiTitle", "youtubeQuery"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const SYSTEM = `You write a short "Today in history" desk pack for CladFacts readers.

Given a calendar month-day (e.g. July 16), pick up to 5 REAL events that happened
on that month-day in ANY past year — significant, interesting, or delightfully odd
moments worth a one-line "on this day" callout.

Mix eras and domains when possible (politics, science, culture, sports, disasters,
milestones). Prefer well-documented facts. No invented events.

── Fields ─────────────────────────────────────────────────────────────────
- year: four-digit year the event occurred
- title: short headline (≤90 chars), present tense or news headline style
- body: 1–2 sentences of plain context (≤280 chars). No URLs. No "click here".
- wikiTitle: English Wikipedia article title that best matches the event for a
  free image (e.g. "Apollo_11", "Storming_of_the_Bastille"). Use underscores or
  spaces. Empty string if no good article exists.
- youtubeQuery: a concise YouTube search string to find a relevant video about
  THIS event (documentary clip, archival footage, reputable explainer).
  Include the year and distinctive names when helpful.
  Examples: "Apollo 11 launch July 16 1969", "Trinity test atomic bomb 1945".
  Empty string only if a video is truly unlikely.

Return ONLY JSON matching the schema. Prefer 4–5 strong items; fewer is OK if thin.`;

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

async function callGrok(xaiKey, user) {
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
      tools: [{ type: "web_search" }],
      text: {
        format: {
          type: "json_schema",
          name: "today_in_history",
          schema: SCHEMA,
          strict: true,
        },
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`xAI ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = extractText(data);
  if (!text) throw new Error("empty Grok response");
  return JSON.parse(text);
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

/** Resolve a Wikipedia title to a Commons-hosted thumbnail (free license only). */
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

function isVideoId(id) {
  return typeof id === "string" && /^[\w-]{11}$/.test(id);
}

/**
 * Find a public YouTube video relevant to the history item.
 * Prefers the model's youtubeQuery; falls back to title + year.
 */
async function findYoutubeVideo(apiKey, { year, title, youtubeQuery }) {
  if (!apiKey) return null;
  const q =
    String(youtubeQuery || "").trim() ||
    `${title} ${year} history documentary`.trim();
  if (!q) return null;

  try {
    const params = new URLSearchParams({
      key: apiKey,
      part: "snippet",
      type: "video",
      order: "relevance",
      maxResults: "5",
      relevanceLanguage: "en",
      regionCode: "US",
      videoEmbeddable: "true",
      safeSearch: "moderate",
      q: q.slice(0, 120),
    });
    const res = await fetch(`${YT_SEARCH}?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const ids = (data.items || [])
      .map((it) => it?.id?.videoId)
      .filter(isVideoId)
      .slice(0, 5);
    if (!ids.length) return null;

    // Confirm still public / embeddable
    const vParams = new URLSearchParams({
      key: apiKey,
      part: "status,snippet",
      id: ids.join(","),
    });
    const vRes = await fetch(`${YT_VIDEOS}?${vParams}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!vRes.ok) return ids[0]; // best-effort first search hit
    const vData = await vRes.json();
    for (const v of vData.items || []) {
      const id = v?.id;
      const st = v?.status || {};
      if (!isVideoId(id)) continue;
      if (st.privacyStatus && st.privacyStatus !== "public") continue;
      if (st.embeddable === false) continue;
      return id;
    }
    return ids[0] || null;
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
  }).formatToParts(now);
  const md = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const month = md.find((p) => p.type === "month")?.value;
  const day = md.find((p) => p.type === "day")?.value;
  const dateKey = month && day ? `${month}-${day}` : "01-01";
  const monthName = long.find((p) => p.type === "month")?.value || "";
  const dayNum = long.find((p) => p.type === "day")?.value || "";
  const dateLabel = `${monthName} ${dayNum}`.trim();
  return { dateKey, dateLabel };
}

async function attachMedia(items, { ytKey }) {
  const out = [];
  for (const raw of items) {
    const year = Math.round(Number(raw?.year));
    const title = String(raw?.title || "").trim().slice(0, 140);
    const body = String(raw?.body || "").trim().slice(0, 400);
    if (!year || year < 1 || !title || !body) continue;

    let imageUrl = raw.imageUrl || null;
    if (!imageUrl) {
      const wikiTitle = String(raw?.wikiTitle || "").trim();
      if (wikiTitle) imageUrl = await commonsThumbForWikiTitle(wikiTitle);
    }

    let videoId = isVideoId(raw.videoId) ? raw.videoId : null;
    if (!videoId && ytKey) {
      videoId = await findYoutubeVideo(ytKey, {
        year,
        title,
        youtubeQuery: raw.youtubeQuery,
      });
    }

    out.push({
      year,
      title,
      body,
      imageUrl: imageUrl || null,
      videoId: videoId || null,
    });
  }
  return out;
}

export async function runTodayInHistory(agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY missing" };
  const ytKey = process.env.YOUTUBE_API_KEY || "";

  const maxItems = Math.min(Math.max(Number(agent?.config?.maxItems) || 5, 1), 5);
  const force = Boolean(agent?.config?.force);
  const { dateKey, dateLabel } = deskDateParts();

  // Skip full regen only when the pack matches *today's desk date* (ET) and
  // is complete. A UTC-day match alone is not enough — after midnight ET the
  // dateKey rolls (e.g. 07-16 → 07-17) and we must rebuild.
  const existing = await getTodayInHistory();
  if (existing.ok && !force) {
    const store = existing.body?.store;
    if (
      store?.dateKey === dateKey &&
      Array.isArray(store.items) &&
      store.items.length
    ) {
      const missingVideo = store.items.some((i) => !i.videoId);
      if (!missingVideo) {
        return {
          ok: true,
          message: `already fresh for ${dateLabel} (${store.items.length} items)`,
          submitted: 0,
          skipped: store.items.length,
        };
      }
      // Same desk day but missing embeds: fill videos only (keep copy + thumbs).
      if (ytKey) {
        const enriched = await attachMedia(
          store.items.map((i) => ({
            year: i.year,
            title: i.title,
            body: i.body,
            imageUrl: i.imageUrl,
            videoId: i.videoId,
            youtubeQuery: `${i.title} ${i.year}`,
          })),
          { ytKey }
        );
        const put = await putTodayInHistory({
          dateKey,
          dateLabel: store.dateLabel || dateLabel,
          items: enriched,
        });
        if (!put.ok) {
          return {
            ok: false,
            message: `video enrich store failed: ${put.status}`,
          };
        }
        const withVid = enriched.filter((i) => i.videoId).length;
        return {
          ok: true,
          message: `${dateLabel}: enriched videos ${withVid}/${enriched.length}`,
          submitted: enriched.length,
          skipped: 0,
        };
      }
    }
  }

  let result;
  try {
    result = await callGrok(
      xaiKey,
      `Today is ${dateLabel} (month-day ${dateKey}).\n` +
        `Research real historical events that occurred on this month-day in past years.\n` +
        `Return up to ${maxItems} significant or interesting items for a "Today in history" list.\n` +
        `For each item include a youtubeQuery that would find a relevant video.\n` +
        `Mix domains; keep it factual and fun. No links in the body.`
    );
  } catch (err) {
    return { ok: false, message: String(err?.message || err).slice(0, 280) };
  }

  const rawItems = (Array.isArray(result.items) ? result.items : []).slice(0, maxItems);
  const items = await attachMedia(rawItems, { ytKey });

  if (!items.length) {
    return { ok: false, message: "no valid history items from model" };
  }

  const put = await putTodayInHistory({
    dateKey,
    dateLabel,
    items,
  });
  if (!put.ok) {
    return {
      ok: false,
      message: `store failed: ${put.status} ${JSON.stringify(put.body).slice(0, 120)}`,
    };
  }

  const withImg = items.filter((i) => i.imageUrl).length;
  const withVid = items.filter((i) => i.videoId).length;
  return {
    ok: true,
    message: `${dateLabel}: ${items.length} items (${withImg} thumbs, ${withVid} videos)`,
    submitted: items.length,
    skipped: 0,
  };
}
