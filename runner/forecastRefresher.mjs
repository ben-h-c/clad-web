/**
 * Election forecast refresher — keeps the party map "as of" date and
 * competitive ratings current via Grok + web_search.
 *
 * Base ratings live in src/lib/electionForecast.ts. This agent posts a live
 * overlay to AGENTS KV (merged with previous patches) so /elections/map shows
 * today's desk date and updated Cook-style bands without a code deploy.
 */
import { getElectionForecastLive, putElectionForecastLive } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";

const RATINGS = [
  "solid-d",
  "likely-d",
  "lean-d",
  "tossup",
  "lean-r",
  "likely-r",
  "solid-r",
  "no-race",
];

const SCHEMA = {
  type: "object",
  properties: {
    asOf: {
      type: "string",
      description: "Desk date YYYY-MM-DD in America/New_York (usually today)",
    },
    reason: {
      type: "string",
      description: "What changed in the ratings landscape this pass",
    },
    senate: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          rating: { type: "string" },
          favored: { type: "string" },
          note: { type: "string" },
          current: { type: "string" },
        },
        required: ["code", "rating", "favored", "note", "current"],
        additionalProperties: false,
      },
    },
    governor: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          rating: { type: "string" },
          favored: { type: "string" },
          note: { type: "string" },
          current: { type: "string" },
        },
        required: ["code", "rating", "favored", "note", "current"],
        additionalProperties: false,
      },
    },
    house: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          rating: { type: "string" },
          favored: { type: "string" },
          note: { type: "string" },
          current: { type: "string" },
        },
        required: ["code", "rating", "favored", "note", "current"],
        additionalProperties: false,
      },
    },
    control: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          rating: { type: "string" },
          favored: { type: "string" },
          note: { type: "string" },
          current: { type: "string" },
        },
        required: ["code", "rating", "favored", "note", "current"],
        additionalProperties: false,
      },
    },
  },
  required: ["asOf", "reason", "senate", "governor", "house", "control"],
  additionalProperties: false,
};

const SYSTEM = `You are the elections map desk for CladFacts. Maintain Cook-style
party-outlook bands for the 2026 U.S. midterms map (solid/likely/lean/toss-up).

This is a GLANCEABILITY snapshot — not CladFacts grades, not a poll, not a market.
Use web_search (Cook Political Report mentions, Sabato, Inside Elections, Ballotpedia,
AP/Reuters race previews, recent primaries) to refresh competitive races.

── Output ─────────────────────────────────────────────────────────────────
- asOf: ALWAYS today's date in America/New_York as YYYY-MM-DD (even if ratings
  barely moved — the public "as of" stamp must not go stale).
- reason: 1–2 sentences on what you checked / what moved.
- senate / governor / house / control: ONLY states where you have a confident
  update or reaffirmation. Empty arrays are OK if search is thin — asOf still updates.
- code: 2-letter state code (e.g. GA, NC, AZ).
- rating: one of solid-d | likely-d | lean-d | tossup | lean-r | likely-r | solid-r | no-race
- favored: short matchup string or "" 
- note: short context or ""
- current: holder party D | R | S | N, or "" if unchanged / unknown

── Focus ──────────────────────────────────────────────────────────────────
Prioritize Class II Senate marquee races (GA, NC, MI, ME, NH, TX, MN, …) and
2026 governor battlegrounds (AZ, PA, WI, NV, GA, MI, …). Reaffirm or shift ratings
when primaries finish, candidates withdraw, or consensus raters move a race.

Do not invent candidates. Prefer conservative rating moves. Empty favored/note/current
use "".

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

function etDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
}

function etStamp() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
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
      tools: [{ type: "web_search", max_search_results: 12 }],
      text: {
        format: {
          type: "json_schema",
          name: "election_forecast",
          schema: SCHEMA,
          strict: true,
        },
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`xAI ${res.status}: ${t.slice(0, 280)}`);
  }
  const data = await res.json();
  const text = extractText(data);
  if (!text) throw new Error("empty Grok response");
  return JSON.parse(text);
}

function rowsToMap(rows) {
  if (!Array.isArray(rows)) return undefined;
  const out = {};
  for (const row of rows) {
    const code = String(row?.code || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) && code !== "DC") continue;
    const rating = String(row?.rating || "").trim();
    if (!RATINGS.includes(rating)) continue;
    const patch = { rating };
    const favored = String(row?.favored || "").trim();
    const note = String(row?.note || "").trim();
    const current = String(row?.current || "").trim().toUpperCase();
    if (favored) patch.favored = favored.slice(0, 120);
    if (note) patch.note = note.slice(0, 220);
    if (current === "D" || current === "R" || current === "S" || current === "N") {
      patch.current = current;
    }
    out[code] = patch;
  }
  return Object.keys(out).length ? out : undefined;
}

export async function runForecastRefresher(agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY missing" };

  let previous = null;
  try {
    const cur = await getElectionForecastLive();
    previous = cur?.ok ? cur.body?.store || null : null;
  } catch {
    /* first run */
  }

  const today = etDateKey();
  const user = [
    `Desk date (America/New_York): ${etStamp()} → asOf MUST be ${today}.`,
    previous?.asOf
      ? `Previous live asOf: ${previous.asOf}. Previous reason: ${previous.reason || "—"}`
      : "No previous live forecast overlay.",
    "",
    "Search for current 2026 midterm Senate and governor rating consensus.",
    "Return asOf = today even if ratings are unchanged. Update competitive races when warranted.",
  ].join("\n");

  const raw = await callGrok(xaiKey, user);

  // Force desk today so the public stamp cannot lag.
  const asOf = today;
  const payload = {
    asOf,
    generatedAt: new Date().toISOString(),
    reason: String(raw.reason || `Forecast refresh ${asOf}`).slice(0, 400),
    senate: rowsToMap(raw.senate),
    governor: rowsToMap(raw.governor),
    house: rowsToMap(raw.house),
    control: rowsToMap(raw.control),
  };

  const put = await putElectionForecastLive(payload);
  if (!put.ok) {
    const err =
      put.body?.error || put.body?.raw || JSON.stringify(put.body || {}).slice(0, 200);
    return {
      ok: false,
      message: `POST /api/agent/election-forecast ${put.status}: ${err}`,
      submitted: 0,
      skipped: 0,
    };
  }

  const n =
    Object.keys(payload.senate || {}).length +
    Object.keys(payload.governor || {}).length +
    Object.keys(payload.house || {}).length +
    Object.keys(payload.control || {}).length;

  return {
    ok: true,
    message: `forecast asOf=${asOf} · ${n} state patches · ${payload.reason.slice(0, 90)}`,
    submitted: 1,
    skipped: 0,
  };
}
