/**
 * News Calendar Scanner — web-search for dated news events (past + future)
 * that belong on a busy U.S. daybook, and merge into the home calendar KV store.
 *
 * Dig-in links must be CladFacts platform paths only (never external URLs).
 * POST /api/agent/calendar merges by event id with windowed replace so density
 * accumulates across runs (events outside the active window are kept).
 */
import { getCalendarEvents, putCalendarEvents } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";

const KINDS = [
  "election",
  "primary",
  "general",
  "politics",
  "speech",
  "markets",
  "conflict",
  "disaster",
  "court",
  "diplomacy",
  "culture",
  "sports",
  "deadline",
  "science",
  "launch",
  "other",
];

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          date: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          kind: { type: "string", enum: KINDS },
          state: { type: "string" },
          links: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                href: { type: "string" },
              },
              required: ["label", "href"],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "date", "title", "kind"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "events"],
  additionalProperties: false,
};

const SYSTEM = `You are the news daybook desk for CladFacts, a U.S. fact-checking news site.

Your job: fill a BUSY national calendar with REAL, date-specific events — both
UPCOMING and RECENT PAST — that a general-interest U.S. news desk would put on
its wire daybook. Aim for density: key events most days when real public dates exist.

Use web search. Prefer wire + major U.S. outlets and official calendars
(AP, Reuters, major papers, White House, Congress, federal agencies, Fed, SCOTUS
calendar, state SoS, sports leagues, major awards).

── The bar (include when it clears) ───────────────────────────────────────
Include if a typical American news consumer would notice the date:
- National politics (president, Congress, major agency action)
- Elections / primaries (national or large-state)
- SCOTUS argument/decision days, major federal court days
- Wars, large military actions, crises affecting U.S. security or markets
- Disasters with multi-state or national impact
- Economy: Fed decisions, jobs reports, CPI when treated as national news,
  debt ceiling / shutdown deadlines, major market-moving events
- Landmark civic moments (inauguration, SOTU, major commemorations, federal holidays
  with significant news stakes)
- Major sports finals / championships already in mainstream national news
- Major culture awards / ceremonies with broad U.S. coverage
- Diplomacy summits involving the U.S. or major allies
- Science/space only when already mainstream national news with public stakes

Prefer PLACING something real on most weekdays in the window when a scheduled
public date exists. One strong entry per distinct event (no fluff duplicates).

── Windows ────────────────────────────────────────────────────────────────
Only return events whose date falls INSIDE the requested window (inclusive).
UPCOMING: scheduled or firmly expected public dates.
RECENT PAST: major things that already happened — log them on the day they OCCURRED.

── Exclude ────────────────────────────────────────────────────────────────
- Opinion / pundit segments with no dated event
- Routine unnamed briefings, minor local hearings
- Vague "sometime this month" without a calendar day
- Invented or guessed dates — if the day is uncertain, OMIT
- Pure niche trade-press calendars without public stakes
- External dig-in links (see links rules)

── Fields ─────────────────────────────────────────────────────────────────
- id: stable slug (reuse when updating the same event)
- date: YYYY-MM-DD only. U.S. civil date when ambiguous.
- title: short desk headline (≤100 chars)
- body: 1–3 sentences — why it matters
- kind: one of ${KINDS.join(" | ")}
- state: US postal only if clearly state-scoped; else omit
- links: OPTIONAL. ONLY CladFacts site paths starting with "/" — never http(s) URLs.
  Allowed examples: "/bracket/", "/elections/map/", "/politicians/", "/breaking/",
  "/search/", "/posts/<slug>/", "/topics/<slug>/".
  If you do not know a real CladFacts path, OMIT links entirely.
  Do NOT invent post slugs. Do NOT link external sites.

Target: return as many verified daybook events as you can find in THIS window
(aim for the targetMinEvents in the user message). Prefer density with real
dates over a thin "highlights only" list. Never invent events to hit the target.

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

async function callGrok(xaiKey, user) {
  const res = await fetch(XAI_RESPONSES, {
    method: "POST",
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
          name: "news_calendar_scan",
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

function isoDayOffset(baseIso, days) {
  const t = Date.parse(`${baseIso}T12:00:00.000Z`);
  const d = new Date(t + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Drop any non-platform links before POST (defense in depth). */
function scrubEventLinks(events) {
  return (Array.isArray(events) ? events : []).map((e) => {
    if (!e || typeof e !== "object") return e;
    const links = Array.isArray(e.links)
      ? e.links.filter((l) => {
          const href = String(l?.href || "").trim();
          return href.startsWith("/") && !href.startsWith("//") && !href.includes("://");
        })
      : undefined;
    const next = { ...e };
    if (links && links.length) next.links = links;
    else delete next.links;
    return next;
  });
}

function dedupeById(events) {
  const byId = new Map();
  for (const e of events) {
    if (!e?.id) continue;
    byId.set(String(e.id), e);
  }
  return [...byId.values()];
}

/**
 * Split [windowStart, windowEnd] into ~10-day chunks so each Grok call can
 * pack a dense daybook instead of under-filling a multi-month span.
 */
function chunkWindow(windowStart, windowEnd, chunkDays = 10) {
  const chunks = [];
  let cur = windowStart;
  while (cur <= windowEnd) {
    const end = isoDayOffset(cur, chunkDays - 1);
    const capped = end > windowEnd ? windowEnd : end;
    chunks.push([cur, capped]);
    cur = isoDayOffset(capped, 1);
    if (chunks.length >= 10) break; // hard cap Grok calls per run
  }
  return chunks;
}

export async function runCalendarScanner(agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY missing" };

  const lookAhead = Math.min(Math.max(Number(agent?.config?.lookAheadDays) || 60, 7), 90);
  const lookBack = Math.min(Math.max(Number(agent?.config?.lookBackDays) || 21, 3), 45);
  const maxEvents = Math.min(Math.max(Number(agent?.config?.maxEventsPerRun) || 90, 10), 150);
  const maxStored = Math.min(Math.max(Number(agent?.config?.maxStoredEvents) || 800, 100), 1200);
  const targetMin = Math.min(Math.max(Number(agent?.config?.targetMinEvents) || 50, 15), 120);

  const today = new Date().toISOString().slice(0, 10);
  const windowStart = isoDayOffset(today, -lookBack);
  const windowEnd = isoDayOffset(today, lookAhead);

  const existing = await getCalendarEvents();
  if (!existing.ok) {
    return { ok: false, message: `fetch calendar failed: ${existing.status}` };
  }
  const priorAll = Array.isArray(existing.body?.store?.events) ? existing.body.store.events : [];
  const prior = priorAll.slice(-100);

  const chunks = chunkWindow(windowStart, windowEnd, 12);
  const targetPerChunk = Math.max(8, Math.ceil(targetMin / Math.max(chunks.length, 1)));

  const collected = [];
  const summaries = [];
  let chunkErrors = 0;

  for (const [chunkStart, chunkEnd] of chunks) {
    const inChunkPrior = prior
      .filter((e) => e.date >= chunkStart && e.date <= chunkEnd)
      .slice(0, 20)
      .map((e) => ({ id: e.id, date: e.date, title: e.title, kind: e.kind }));

    const payload = {
      today,
      windowStart: chunkStart,
      windowEnd: chunkEnd,
      targetMinEvents: targetPerChunk,
      maxEvents: Math.min(40, Math.ceil(maxEvents / chunks.length) + 8),
      instruction:
        "Dense U.S. news daybook. Fill real public dates in THIS window only. " +
        "Prefer ≥1 newsworthy item on most weekdays when a firm date exists. " +
        "No external links — CladFacts paths only or omit links.",
      existingInWindow: inChunkPrior,
    };

    try {
      const result = await callGrok(
        xaiKey,
        `Scan the U.S. news daybook for CladFacts — CHUNK ONLY.\n` +
          `Window (inclusive): ${chunkStart} through ${chunkEnd}.\n` +
          `Target at least ${targetPerChunk} verified dated events in this chunk.\n` +
          `Only events with firm YYYY-MM-DD dates inside the window.\n` +
          `Links: CladFacts paths only — never external URLs.\n\n` +
          `${JSON.stringify(payload, null, 2)}`
      );
      const scrubbed = scrubEventLinks(Array.isArray(result.events) ? result.events : []).filter(
        (e) => e?.date && e.date >= chunkStart && e.date <= chunkEnd
      );
      collected.push(...scrubbed);
      if (result.summary) summaries.push(String(result.summary).slice(0, 200));
    } catch (err) {
      chunkErrors++;
      // One chunk failure shouldn't abort the whole run.
      summaries.push(`chunk ${chunkStart}..${chunkEnd} failed: ${String(err?.message || err).slice(0, 80)}`);
    }
  }

  const events = dedupeById(collected).slice(0, maxEvents);
  const summary = summaries.filter(Boolean).join(" · ").slice(0, 2000);

  if (events.length === 0 && chunkErrors === chunks.length) {
    return { ok: false, message: `all ${chunks.length} daybook chunks failed` };
  }

  const put = await putCalendarEvents({
    events,
    summary,
    maxStored,
    // Windowed replace: refresh this scan range, keep agent events outside it.
    replaceAgent: false,
    replaceAgentInWindow: { start: windowStart, end: windowEnd },
  });
  if (!put.ok) {
    return {
      ok: false,
      message: `store failed: ${put.status} ${JSON.stringify(put.body).slice(0, 120)}`,
    };
  }

  const merged = put.body?.merged ?? events.length;
  const total = put.body?.total ?? "?";
  const upcoming = events.filter((e) => String(e.date) >= today).length;
  const past = events.length - upcoming;

  return {
    ok: true,
    message:
      `scanned ${events.length} across ${chunks.length} chunks ` +
      `(${upcoming} upcoming, ${past} past` +
      (chunkErrors ? `, ${chunkErrors} chunk errs` : "") +
      `) · store ${total} · ${summary.slice(0, 100)}`,
    submitted: merged,
    skipped: 0,
  };
}
