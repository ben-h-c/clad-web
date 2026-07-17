/**
 * News Calendar Scanner — web-search for dated news events (past + future)
 * that matter to most Americans, and merge into the home calendar KV store.
 *
 * Dig-in links must be CladFacts platform paths only (never external URLs).
 * POST /api/agent/calendar merges by event id.
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

const SYSTEM = `You are the news calendar desk for CladFacts, a U.S. fact-checking news site.

Your job: find REAL, date-specific events — both UPCOMING and RECENT PAST — that are
IMPORTANT OR IMPACTFUL TO MOST AMERICANS. This is a national news desk calendar,
not a niche hobby board and not election-only.

Use web search. Prefer wire + major U.S. outlets and official calendars
(AP, Reuters, major papers, White House, Congress, federal agencies, state SoS).

── The bar (must clear this) ──────────────────────────────────────────────
Include an event only if a typical American would care about the date itself:
- National politics (president, Congress, major agency action with broad effect)
- Elections / primaries that matter nationally or in large states
- Major SCOTUS or federal court days with broad rights/policy impact
- Wars, large military actions, or crises that shape U.S. security or markets
- Disasters with multi-state or national human/economic impact
- Economy: Fed decisions, debt ceiling, major jobs report days when treated as
  market-moving national news (not every data release)
- Landmark national moments (inauguration, State of the Union, major commemorations)
- Only include tech/space/sports/culture if the story is already mainstream national
  news with broad public stakes — NOT routine product launches, test flights, or
  industry-only events.

SpaceX / Starship-style items are NOT default inclusions. Skip niche science,
celebrity, local politics, and trade-press calendars unless the U.S. public impact
is clear and large.

── Windows ────────────────────────────────────────────────────────────────
UPCOMING (today through lookAheadDays): scheduled or firmly expected public dates.
RECENT PAST (lookBackDays through yesterday): major things that already happened —
log them on the day they OCCURRED for reference (war begins, disaster landfall,
historic vote, assassination attempt, crash, landmark ruling).

── Exclude ────────────────────────────────────────────────────────────────
- Opinion / pundit segments with no dated event
- Routine briefings, press gaggles, minor hearings
- Vague "sometime this month" without a calendar day
- Duplicate fluff (one strong entry per event)
- Niche or low-impact items that most Americans would not plan around or remember

── Fields ─────────────────────────────────────────────────────────────────
- id: stable slug (reuse when updating the same event)
- date: YYYY-MM-DD only. U.S. civil date when ambiguous.
- title: short desk headline (≤100 chars)
- body: 1–3 sentences — why it matters to Americans
- kind: one of ${KINDS.join(" | ")}
- state: US postal only if clearly state-scoped; else omit
- links: OPTIONAL. ONLY CladFacts site paths starting with "/" — never http(s) URLs.
  Allowed examples: "/bracket/", "/elections/map/", "/politicians/", "/breaking/",
  "/search/", "/posts/<slug>/", "/topics/<slug>/".
  If you do not know a real CladFacts path, OMIT links entirely (empty or omit field).
  Do NOT invent post slugs. Do NOT link AP, NASA, White House, or any external site.

Quality bar: if the date or national importance is shaky, omit the event.
Return ONLY JSON matching the schema. Empty events array is OK if search is thin.`;

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

export async function runCalendarScanner(agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY missing" };

  const lookAhead = Math.min(Math.max(Number(agent?.config?.lookAheadDays) || 21, 7), 45);
  const lookBack = Math.min(Math.max(Number(agent?.config?.lookBackDays) || 14, 3), 45);
  const maxEvents = Math.min(Math.max(Number(agent?.config?.maxEventsPerRun) || 40, 10), 60);
  const maxStored = Math.min(Math.max(Number(agent?.config?.maxStoredEvents) || 400, 100), 800);

  const today = new Date().toISOString().slice(0, 10);
  const windowStart = isoDayOffset(today, -lookBack);
  const windowEnd = isoDayOffset(today, lookAhead);

  const existing = await getCalendarEvents();
  if (!existing.ok) {
    return { ok: false, message: `fetch calendar failed: ${existing.status}` };
  }
  const prior = Array.isArray(existing.body?.store?.events)
    ? existing.body.store.events.slice(-80)
    : [];

  const payload = {
    today,
    windowStart,
    windowEnd,
    lookBackDays: lookBack,
    lookAheadDays: lookAhead,
    maxEvents,
    instruction:
      "National-impact calendar only. Most Americans should care. " +
      "No external links — CladFacts paths only or omit links. " +
      "Upcoming scheduled + major past events to log for reference.",
    existingEventIds: prior.map((e) => e.id).filter(Boolean).slice(0, 80),
    sampleExisting: prior.slice(-12).map((e) => ({
      id: e.id,
      date: e.date,
      title: e.title,
      kind: e.kind,
    })),
  };

  let result;
  try {
    result = await callGrok(
      xaiKey,
      `Scan the U.S. news calendar for CladFacts.\n` +
        `Only events important or impactful to most Americans.\n` +
        `Window: past since ${windowStart}, upcoming through ${windowEnd}.\n` +
        `Do not default to niche tech/space items. Prefer politics, security, economy, ` +
        `courts, disasters, and elections with broad public stakes.\n` +
        `Links: CladFacts paths only — never external URLs.\n\n` +
        `${JSON.stringify(payload, null, 2)}`
    );
  } catch (err) {
    return { ok: false, message: String(err?.message || err).slice(0, 280) };
  }

  const events = scrubEventLinks(
    (Array.isArray(result.events) ? result.events : []).slice(0, maxEvents)
  );
  const summary = String(result.summary || "").slice(0, 2000);

  const put = await putCalendarEvents({
    events,
    summary,
    maxStored,
    // Drop prior agent rows so niche leftovers (e.g. early test items) do not stick.
    replaceAgent: true,
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
    message: `scanned ${events.length} (${upcoming} upcoming, ${past} past) · store ${total} · ${summary.slice(0, 120)}`,
    submitted: merged,
    skipped: 0,
  };
}
