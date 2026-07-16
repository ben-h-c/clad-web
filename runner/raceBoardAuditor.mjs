/**
 * Race Board Auditor — web-search grounded check of every card on the
 * Midterms 2026 race board (src/lib/races.ts).
 *
 * 1) Candidates: flags withdrawn nominees, wrong incumbents, open seats
 *    mislabeled as incumbents, etc. Does NOT auto-edit races.ts (editorial apply).
 * 2) Election dates: researches nextVoteDate for every race and PUBLISHES
 *    them live via the audit report (ISO YYYY-MM-DD or "TBD" when undecided).
 *
 * Stores findings + electionDates in KV via POST /api/agent/races.
 */
import { getRaceBoard, putRaceAuditReport } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";

const VOTE_KINDS = ["primary", "runoff", "special", "general", "party-process", "undecided"];

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raceId: { type: "string" },
          office: { type: "string" },
          severity: { type: "string", enum: ["critical", "stale", "info"] },
          issue: { type: "string" },
          detail: { type: "string" },
          suggestedA: { type: "string" },
          suggestedB: { type: "string" },
          suggestedNextVoteDate: { type: "string" },
          sources: { type: "array", items: { type: "string" } },
        },
        required: ["raceId", "office", "severity", "issue", "detail"],
        additionalProperties: false,
      },
    },
    electionDates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raceId: { type: "string" },
          office: { type: "string" },
          /** YYYY-MM-DD when known; the literal "TBD" when not decided. */
          nextVoteDate: { type: "string" },
          voteKind: { type: "string", enum: VOTE_KINDS },
          generalDate: { type: "string" },
          note: { type: "string" },
          sources: { type: "array", items: { type: "string" } },
        },
        required: ["raceId", "office", "nextVoteDate", "voteKind", "generalDate"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "findings", "electionDates"],
  additionalProperties: false,
};

const SYSTEM = `You are the elections desk for CladFacts, a fact-checking site. Audit a curated
list of 2026 U.S. midterm race cards (Class II Senate + selected governors).

Use web search (Ballotpedia, AP, Reuters, major state papers, official Secretary of State /
elections division pages, party committee notices) to verify:

A) CANDIDATES — who is CURRENTLY on the ballot or the clear leading contender as of today.
B) ELECTION DATES — the next meaningful vote date for EACH race, published as soon as known.

── Candidates (findings) ──────────────────────────────────────────────────
Flag problems only when evidence is strong:
- critical: a named person is listed as the nominee/contender but has withdrawn, died,
  lost a primary, is not running, or is the wrong Senate class for 2026.
- stale: both sides are still "field" but nominees have locked (or vice versa);
  labels need refresh but are not dangerously wrong.
- info: optional note (primary date approaching, special calendar).

Rules:
- 2026 federal Senate races are Class II only. Do not put Class I (next 2030) or
  Class III (next 2028) senators on this board as 2026 Senate cards.
- Prefer major-party nominees once primaries are finished.
- If a primary winner withdrew, the card must NOT keep them as the active side —
  use "nominee TBD" / field until a replacement is named.
- Do not invent candidates. If search is unclear, omit a finding rather than guess.
- suggestedA / suggestedB should be short display names for the board if a change is needed.
- sources: 1–3 URLs or outlet+date strings you actually used.

── Election dates (electionDates — REQUIRED for every race in the payload) ─
For EACH raceId in the input, return one electionDates entry:

- nextVoteDate: ISO calendar day "YYYY-MM-DD" of the next meaningful public vote
  (primary, runoff, special election, or general). When the date has NOT been
  decided or is not yet published by officials / parties, you MUST set
  nextVoteDate to the literal string "TBD" (never invent a date).
- voteKind: one of primary | runoff | special | general | party-process | undecided
  (use party-process when a party will name a replacement without a scheduled primary;
  use undecided when nextVoteDate is TBD).
- generalDate: the general election day for that race (almost always 2026-11-03 for
  this midterm board). Use "TBD" only if truly unknown.
- note: short free text (optional), e.g. "Dem replacement committee; no filing date yet".
- sources: 1–3 sources for the date when known.

Date findings (optional, in findings array):
- If the board's current nextVoteDate is wrong or missing while you found a real date,
  add a finding with issue "wrong-date" or "date-now-set", severity "stale" (or
  "critical" if the vote is within 14 days and the board is wrong), and set
  suggestedNextVoteDate to the correct ISO date or "TBD".
- If the board invents a date that is not official, flag it and set suggestedNextVoteDate "TBD".

Publish ASAP: as soon as an official primary / special / general date is confirmed,
nextVoteDate must be that ISO day — do not leave TBD when the calendar is public.

Return ONLY JSON matching the schema. electionDates length must match the number of
races audited. Empty findings array means candidate labels look accurate.`;

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  for (const item of data?.output || []) {
    for (const c of item?.content || []) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") return c.text;
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
          name: "race_board_audit",
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

function normalizeDateField(raw) {
  if (raw == null || raw === "") return "TBD";
  const s = String(raw).trim();
  const up = s.toUpperCase();
  if (up === "TBD" || up === "TDB" || up === "UNKNOWN" || up === "UNDECIDED") return "TBD";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return "TBD";
}

function normalizeVoteKind(raw, nextVoteDate) {
  const k = String(raw || "").toLowerCase();
  if (VOTE_KINDS.includes(k)) return k;
  if (nextVoteDate === "TBD") return "undecided";
  return "general";
}

function normalizeElectionDates(rawList, races) {
  const byId = new Map();
  for (const item of Array.isArray(rawList) ? rawList : []) {
    const raceId = String(item?.raceId || "").slice(0, 80);
    if (!raceId) continue;
    const nextVoteDate = normalizeDateField(item.nextVoteDate);
    const generalDate = normalizeDateField(item.generalDate);
    byId.set(raceId, {
      raceId,
      office: String(item.office || "").slice(0, 160),
      nextVoteDate,
      voteKind: normalizeVoteKind(item.voteKind, nextVoteDate),
      generalDate: generalDate === "TBD" ? "2026-11-03" : generalDate,
      note: item.note ? String(item.note).slice(0, 400) : undefined,
      sources: Array.isArray(item.sources)
        ? item.sources.map((s) => String(s).slice(0, 300)).slice(0, 6)
        : undefined,
    });
  }

  // Every audited race gets a published row. Prefer the model's answer; if the
  // model omitted a race, keep the board's current date (do not wipe known days
  // to TBD). Use TBD only when the model (or board) says the date is undecided.
  const out = [];
  for (const r of races) {
    const existing = byId.get(r.id);
    if (existing) {
      if (!existing.office) existing.office = r.office || r.id;
      out.push(existing);
      continue;
    }
    const boardNext = normalizeDateField(r.nextVoteDate);
    const boardGeneral = normalizeDateField(r.generalDate);
    out.push({
      raceId: r.id,
      office: r.office || r.id,
      nextVoteDate: boardNext,
      voteKind: normalizeVoteKind(r.voteKind, boardNext),
      generalDate: boardGeneral === "TBD" ? "2026-11-03" : boardGeneral,
      note: "Auditor omitted this race's date — kept board value until next run.",
    });
  }
  return out;
}

export async function runRaceBoardAuditor(agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY missing" };

  const max = Math.min(Number(agent?.config?.maxRacesPerRun) || 24, 40);
  const cfg = await getRaceBoard();
  if (!cfg.ok) return { ok: false, message: `fetch races failed: ${cfg.status}` };

  const board = cfg.body?.board;
  if (!board?.races?.length) return { ok: false, message: "empty race board" };

  const races = board.races.slice(0, max);
  const payload = {
    today: new Date().toISOString().slice(0, 10),
    boardVerifiedAsOf: board.verifiedAsOf,
    instruction:
      "For every race, return electionDates with nextVoteDate (YYYY-MM-DD or TBD) and voteKind. Publish dates as soon as official; use TBD when not decided.",
    races,
  };

  let result;
  try {
    result = await callGrok(
      xaiKey,
      `Audit these CladFacts race cards against current 2026 election reality.\n` +
        `Research candidates AND next vote dates for every race.\n\n${JSON.stringify(payload, null, 2)}`
    );
  } catch (err) {
    return { ok: false, message: String(err?.message || err).slice(0, 280) };
  }

  const findings = Array.isArray(result.findings) ? result.findings : [];
  const electionDates = normalizeElectionDates(result.electionDates, races);
  const dated = electionDates.filter((d) => d.nextVoteDate !== "TBD").length;
  const tbd = electionDates.length - dated;

  const report = {
    generatedAt: new Date().toISOString(),
    boardVerifiedAsOf: board.verifiedAsOf || "",
    racesAudited: races.length,
    summary: String(result.summary || "").slice(0, 2000),
    findings,
    electionDates,
  };

  const put = await putRaceAuditReport(report);
  if (!put.ok) return { ok: false, message: `store failed: ${put.status}` };

  const critical = findings.filter((f) => f.severity === "critical").length;
  const stale = findings.filter((f) => f.severity === "stale").length;
  return {
    ok: true,
    message:
      `audited ${races.length} races · ${critical} critical · ${stale} stale · ` +
      `${findings.length} findings · dates ${dated} set / ${tbd} TBD`,
    submitted: findings.length + electionDates.length,
    skipped: 0,
  };
}
