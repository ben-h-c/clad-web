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
  free Commons lead image (e.g. "Spanish Armada", "Apollo 11",
  "Storming of the Bastille"). Prefer the PRIMARY article with a famous painting
  or photo — not disambiguation pages, lists, or obscure sub-articles.
  Empty string only if no good article exists.
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
      tools: [{ type: "web_search", max_search_results: 6 }],
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

/** Canonicalize Commons thumbs (drop tracking query params; keep stable path). */
function cleanCommonsUrl(url) {
  if (!url || !isCommonsUrl(url)) return null;
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    // Prefer a mid-size thumb when API returns full original (faster LCP).
    const path = u.pathname;
    if (path.includes("/thumb/")) return u.toString();
    // …/commons/a/ab/File.jpg → request 640px thumb when possible
    const m = path.match(/^\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/i);
    if (m) {
      const file = m[3];
      u.pathname = `/wikipedia/commons/thumb/${m[1]}/${m[2]}/${file}/640px-${file}`;
    }
    return u.toString();
  } catch {
    return null;
  }
}

function wikiTitleCandidates(wikiTitle, eventTitle, year) {
  const out = [];
  const push = (t) => {
    const s = String(t || "")
      .trim()
      .replace(/_/g, " ")
      .replace(/\s+/g, " ");
    if (!s || s.length < 2) return;
    if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  };
  push(wikiTitle);
  // Common model mistakes: trailing "(event)", year in title, quotes
  if (wikiTitle) {
    push(String(wikiTitle).replace(/\s*\([^)]*\)\s*$/, ""));
    push(String(wikiTitle).replace(/_/g, " "));
  }
  if (eventTitle) {
    push(eventTitle);
    // Drop leading year fragments like "1588 Spanish Armada…"
    push(String(eventTitle).replace(/^\d{3,4}\s*[:\-–]?\s*/, ""));
    // First clause before colon/em dash
    push(String(eventTitle).split(/[:–—|]/)[0]);
  }
  if (year && eventTitle) {
    // e.g. "Spanish Armada" from "Spanish Armada defeated 1588"
    const words = String(eventTitle)
      .replace(/[^a-zA-Z0-9\s\-']/g, " ")
      .split(/\s+/)
      .filter((w) => w && !/^\d{3,4}$/.test(w));
    if (words.length >= 2) push(words.slice(0, 4).join(" "));
    if (words.length >= 2) push(words.slice(0, 3).join(" "));
  }
  return out.slice(0, 8);
}

/** Resolve a Wikipedia title to a Commons-hosted thumbnail (free license only). */
async function commonsThumbForWikiTitle(title) {
  const t = String(title || "").trim();
  if (!t) return null;
  const enc = encodeURIComponent(t.replace(/ /g, "_"));

  // 1) REST summary (fast)
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const j = await r.json();
      if (j?.type !== "disambiguation") {
        const src = j?.thumbnail?.source || j?.originalimage?.source;
        const cleaned = cleanCommonsUrl(src);
        if (cleaned) return cleaned;
      }
    }
  } catch {
    /* try next */
  }

  // 2) Action API pageimages (often finds a lead image when REST has none / non-Commons)
  try {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      prop: "pageimages",
      piprop: "thumbnail|original",
      pithumbsize: "640",
      titles: t.replace(/_/g, " "),
      redirects: "1",
    });
    const r = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const j = await r.json();
      const pages = j?.query?.pages || {};
      for (const p of Object.values(pages)) {
        if (!p || p.missing != null) continue;
        const src = p.thumbnail?.source || p.original?.source;
        const cleaned = cleanCommonsUrl(src);
        if (cleaned) return cleaned;
      }
    }
  } catch {
    /* try next */
  }

  return null;
}

/**
 * Last-resort: Commons search for a free still matching the event keywords.
 * Still Commons-only (license-safe).
 */
async function commonsSearchThumb(query) {
  const q = String(query || "")
    .replace(/[^\w\s\-']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (q.length < 4) return null;
  try {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      generator: "search",
      gsrsearch: q,
      gsrnamespace: "6", // File:
      gsrlimit: "5",
      prop: "imageinfo",
      iiprop: "url|mime",
      iiurlwidth: "640",
    });
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const pages = j?.query?.pages || {};
    for (const p of Object.values(pages)) {
      const info = p?.imageinfo?.[0];
      if (!info) continue;
      const mime = String(info.mime || "");
      if (mime && !mime.startsWith("image/")) continue;
      const src = info.thumburl || info.url;
      const cleaned = cleanCommonsUrl(src);
      if (cleaned) return cleaned;
    }
  } catch {
    return null;
  }
  return null;
}

/** Best-effort Commons still for a history item (multiple title fallbacks). */
async function resolveHistoryImage(raw) {
  if (raw?.imageUrl) {
    const existing = cleanCommonsUrl(String(raw.imageUrl));
    if (existing) return existing;
  }
  const candidates = wikiTitleCandidates(raw?.wikiTitle, raw?.title, raw?.year);
  for (const title of candidates) {
    const hit = await commonsThumbForWikiTitle(title);
    if (hit) return hit;
  }
  // Commons file search from event title (+ year when useful)
  const year = Number(raw?.year);
  const searchQ =
    year && year > 1000
      ? `${String(raw?.title || "").slice(0, 60)} ${year}`
      : String(raw?.title || "").slice(0, 70);
  return (await commonsSearchThumb(searchQ)) || null;
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

    // Commons stills only — try wikiTitle, title variants, then Commons search.
    const imageUrl = await resolveHistoryImage({
      imageUrl: raw.imageUrl,
      wikiTitle: raw.wikiTitle,
      title,
      year,
    });

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
      const missingThumb = store.items.some((i) => !i.imageUrl);
      if (!missingVideo && !missingThumb) {
        return {
          ok: true,
          message: `already fresh for ${dateLabel} (${store.items.length} items)`,
          submitted: 0,
          skipped: store.items.length,
        };
      }
      // Same desk day but missing thumbs and/or embeds: re-attach media, keep copy.
      const enriched = await attachMedia(
        store.items.map((i) => ({
          year: i.year,
          title: i.title,
          body: i.body,
          imageUrl: i.imageUrl,
          videoId: i.videoId,
          wikiTitle: i.wikiTitle,
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
          message: `media enrich store failed: ${put.status}`,
        };
      }
      const withImg = enriched.filter((i) => i.imageUrl).length;
      const withVid = enriched.filter((i) => i.videoId).length;
      return {
        ok: true,
        message: `${dateLabel}: enriched media ${withImg} thumbs, ${withVid} videos / ${enriched.length}`,
        submitted: enriched.length,
        skipped: 0,
      };
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
