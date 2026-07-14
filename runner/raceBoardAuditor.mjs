/**
 * Race Board Auditor — web-search grounded check of every card on the
 * Midterms 2026 race board (src/lib/races.ts). Flags withdrawn nominees,
 * wrong incumbents, open seats mislabeled as incumbents, etc.
 *
 * Does NOT auto-edit races.ts (editorial apply). Stores findings in KV via
 * POST /api/agent/races for the console / next human pass.
 */
import { getRaceBoard, putRaceAuditReport } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";

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
          sources: { type: "array", items: { type: "string" } },
        },
        required: ["raceId", "office", "severity", "issue", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "findings"],
  additionalProperties: false,
};

const SYSTEM = `You are the elections desk for CladFacts, a fact-checking site. Audit a curated
list of 2026 U.S. midterm race cards (Class II Senate + selected governors).

Use web search (Ballotpedia, AP, Reuters, major state papers, official SOS pages)
to verify who is CURRENTLY on the ballot or is the clear leading contender as of today.

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

Return ONLY JSON matching the schema. Empty findings array means the board looks accurate.`;

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
    races,
  };

  let result;
  try {
    result = await callGrok(
      xaiKey,
      `Audit these CladFacts race cards against current 2026 election reality.\n\n${JSON.stringify(payload, null, 2)}`
    );
  } catch (err) {
    return { ok: false, message: String(err?.message || err).slice(0, 280) };
  }

  const findings = Array.isArray(result.findings) ? result.findings : [];
  const report = {
    generatedAt: new Date().toISOString(),
    boardVerifiedAsOf: board.verifiedAsOf || "",
    racesAudited: races.length,
    summary: String(result.summary || "").slice(0, 2000),
    findings,
  };

  const put = await putRaceAuditReport(report);
  if (!put.ok) return { ok: false, message: `store failed: ${put.status}` };

  const critical = findings.filter((f) => f.severity === "critical").length;
  const stale = findings.filter((f) => f.severity === "stale").length;
  return {
    ok: true,
    message: `audited ${races.length} races · ${critical} critical · ${stale} stale · ${findings.length} total findings`,
    submitted: findings.length,
    skipped: 0,
  };
}
