/**
 * Election caller — news-consensus calls for Ballot Board pick'em winners.
 *
 * Only runs Grok when a general/special vote day has begun (ET) and the race
 * is still uncalled. AP or 2+ major outlets. Never treats a primary as the
 * seat winner. Desk editorial rows are not overwritten (Worker enforces).
 */
import { getRaceCalls, putRaceCalls } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";

const CONF = ["ap", "multi", "single", "none"];
const SIDES = ["a", "b", "other", ""];
const PARTIES = ["D", "R", "I", "O", ""];

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    calls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raceId: { type: "string" },
          office: { type: "string" },
          called: { type: "boolean" },
          winnerName: { type: "string" },
          winnerParty: { type: "string", enum: PARTIES },
          winnerSide: { type: "string", enum: SIDES },
          confidence: { type: "string", enum: CONF },
          outlets: { type: "array", items: { type: "string" } },
          note: { type: "string" },
          calledAt: { type: "string" },
        },
        required: [
          "raceId",
          "office",
          "called",
          "winnerName",
          "winnerParty",
          "winnerSide",
          "confidence",
          "outlets",
          "note",
          "calledAt",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "calls"],
  additionalProperties: false,
};

const SYSTEM = `You are the elections desk for CladFacts. Decide whether the NEWS
CONSENSUS has CALLED the winner of a U.S. race that fills the seat (general
election or special that elects the officeholder). This scores a public pick'em.

Use web_search. Prefer Associated Press race calls, then Reuters, Decision Desk HQ,
NYT, Washington Post, NBC, CBS, ABC, CNN, NPR.

── Call ONLY when ─────────────────────────────────────────────────────────
- The contest that FILLS THE SEAT is over or at poll-close, AND
- AP has called it, OR at least two independent major outlets have called the
  SAME winner (not "leading", not "projected", not an exit-poll lean).

── Do NOT call ────────────────────────────────────────────────────────────
- Primaries, runoffs, nominating conventions, or "won the nomination"
- Polls, forecasts, Cook/Sabato ratings, betting markets
- A single local paper or a campaign statement
- Races whose vote day has not begun

── Output ─────────────────────────────────────────────────────────────────
For each race in the user payload, one calls[] row:
- called: true only if the bar above is met
- winnerName: person who won the seat (empty string if not called)
- winnerParty: D | R | I | O | ""
- winnerSide: a | b | other | "" — match the payload's current a/b people
- confidence: ap (AP called) | multi (2+ majors, no AP) | single | none
- outlets: names of outlets you actually used (e.g. "AP", "Reuters")
- calledAt: ISO time of the call if known, else ""
- note: one short sentence

If nothing is called, called=false, confidence=none, empty winner fields.
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
          name: "election_calls",
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

export async function runElectionCaller(_agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY missing" };

  const cfg = await getRaceCalls();
  if (!cfg.ok) return { ok: false, message: `fetch calls failed: ${cfg.status}` };

  const body = cfg.body || {};
  const races = Array.isArray(body.races) ? body.races : [];
  const results = Array.isArray(body.results) ? body.results : [];
  const calledIds = new Set(
    results.filter((r) => r?.winnerSide && r.winnerSide !== "other").map((r) => r.raceId)
  );
  const eligible = races.filter((r) => r.eligible === true);
  const uncalled = eligible.filter((r) => !calledIds.has(r.id));

  if (!uncalled.length) {
    const n = eligible.length;
    return {
      ok: true,
      message: n
        ? `skip Grok — ${n} eligible, all already called`
        : "skip Grok — no general/special vote day yet",
      submitted: 0,
      skipped: n || races.length,
    };
  }

  const payload = {
    today: new Date().toISOString(),
    instruction:
      "Call a winner only for AP or 2+ major outlets on the seat-filling contest. Primaries are not calls.",
    races: uncalled.map((r) => ({
      raceId: r.id,
      office: r.office,
      voteKind: r.voteKind,
      nextVoteDate: r.nextVoteDate,
      generalDate: r.generalDate,
      a: r.a,
      b: r.b,
    })),
  };

  let result;
  try {
    result = await callGrok(
      xaiKey,
      `Has news consensus called any of these 2026 races?\n\n${JSON.stringify(payload, null, 2)}`
    );
  } catch (err) {
    return { ok: false, message: String(err?.message || err).slice(0, 280) };
  }

  const calls = Array.isArray(result.calls) ? result.calls : [];
  const put = await putRaceCalls({
    generatedAt: new Date().toISOString(),
    summary: String(result.summary || "").slice(0, 2000),
    calls,
  });
  if (!put.ok) {
    const err = put.body?.error || JSON.stringify(put.body || {}).slice(0, 200);
    return { ok: false, message: `POST /api/agent/results ${put.status}: ${err}` };
  }

  const applied = Number(put.body?.applied || 0);
  const skipped = Number(put.body?.skipped || 0);
  return {
    ok: true,
    message: `eligible ${uncalled.length} · applied ${applied} · skipped ${skipped} · ${(result.summary || "").slice(0, 80)}`,
    submitted: applied,
    skipped,
  };
}
