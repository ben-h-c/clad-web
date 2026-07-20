/**
 * Politician Grader — scores the *person* (ideology + claim reliability),
 * not averages of news coverage that happens to mention them.
 *
 * Uses Grok + web_search. Stores results in KV via POST /api/agent/politicians-grade.
 * Priority: officeholders with graded appearances who lack an agent profile.
 */
import { getPoliticianGradeQueue, putPoliticianGrades } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";

const SCHEMA = {
  type: "object",
  properties: {
    leanScore: {
      type: "number",
      description: "Ideology of THIS person: -100 strongly left, 0 center, +100 strongly right",
    },
    leanRationale: {
      type: "string",
      description: "1–2 sentences: voting record, public positions, party faction",
    },
    letterGrade: {
      type: "string",
      description: "A+ through F for reliability of their public claims / statement track record",
    },
    factualityScore: {
      type: "number",
      description: "0–100 how often their public claims hold up under fact-checking",
    },
    gradeRationale: {
      type: "string",
      description: "1–2 sentences citing specific claim-track-record evidence",
    },
  },
  required: ["leanScore", "leanRationale", "letterGrade", "factualityScore", "gradeRationale"],
  additionalProperties: false,
};

const SYSTEM = `You grade U.S. political figures as PEOPLE — not the media that covers them.

Return JSON only.

leanScore (−100…+100): THIS person's ideology and political orientation.
  -100 = far left / democratic socialist, 0 = center, +100 = far right.
  Use voting records, public positions, caucus membership, party faction.
  Examples: Bernie Sanders ≈ −85 to −95 (left). Ted Cruz ≈ +65 to +80 (right).
  NEVER use the slant of news articles ABOUT them. Fox praising Sanders does not
  make Sanders right-leaning. MSNBC criticizing Cruz does not make Cruz left.

letterGrade + factualityScore: reliability of THEIR public statements and claims
  over time (fact-check track record, pattern of accuracy vs spin), NOT the letter
  grades CladFacts gave TV segments that merely mentioned their name.
  A/B = generally careful with facts; C = mixed; D/F = frequent false/misleading claims.

Use web search (Ballotpedia, Congress.gov votes, major fact-checkers, official bios).
If evidence is thin, still give a best-estimate lean from party/office faction and say so
in the rationale; grade claim reliability conservatively (C-range) when unknown.

Be consistent: progressive Democrats score left (negative); mainstream Republicans right (positive).`;

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  for (const item of data?.output || []) {
    for (const c of item?.content || []) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") return c.text;
    }
  }
  return "";
}

async function gradePerson(xaiKey, person) {
  const user = `Grade this officeholder as a person (ideology + claim reliability).

Name: ${person.name}
Office / race label: ${person.race || "—"}
Branch: ${person.bucket || "—"}
CladFacts graded appearances mentioning them: ${person.appearances ?? 0}
  (Do NOT average those appearance grades. Score the person.)

Today: ${new Date().toISOString().slice(0, 10)}`;

  const res = await fetch(XAI_RESPONSES, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${xaiKey}`,
    },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      tools: [{ type: "web_search", max_search_results: 4 }],
      text: {
        format: {
          type: "json_schema",
          name: "politician_person_grade",
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
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("invalid JSON from Grok");
  }
}

export async function runPoliticianGrader(agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY missing" };

  // Keep batches modest: each grade uses web_search and can take ~30–60s.
  // Large batches (40) routinely hit the runner's per-agent timeout.
  const max = Math.min(Number(agent?.config?.maxPoliticiansPerRun) || 12, 20);
  const q = await getPoliticianGradeQueue();
  if (!q.ok) return { ok: false, message: `queue fetch failed: ${q.status}` };

  const queue = (q.body?.queue || []).filter((p) => p.needsGrade);
  if (queue.length === 0) {
    return {
      ok: true,
      message: `All ${q.body?.total ?? 0} officeholders already agent-graded`,
      submitted: 0,
    };
  }

  const batch = queue.slice(0, max);
  const profiles = {};
  let ok = 0;
  let failed = 0;

  for (const person of batch) {
    try {
      const g = await gradePerson(xaiKey, person);
      profiles[person.slug] = {
        leanScore: g.leanScore,
        leanRationale: g.leanRationale,
        letterGrade: g.letterGrade,
        factualityScore: g.factualityScore,
        gradeRationale: g.gradeRationale,
      };
      ok++;
    } catch (err) {
      failed++;
      // Abort hard on rate limits
      if (String(err?.message || "").includes("429") || String(err?.message || "").includes("rate")) {
        break;
      }
    }
  }

  if (Object.keys(profiles).length === 0) {
    return {
      ok: false,
      message: `graded 0/${batch.length} (failed ${failed})`,
      submitted: 0,
    };
  }

  const save = await putPoliticianGrades({ profiles });
  if (!save.ok) {
    return {
      ok: false,
      message: `save failed ${save.status}: ${JSON.stringify(save.body).slice(0, 140)}`,
      submitted: 0,
    };
  }

  return {
    ok: true,
    message: `Person-graded ${ok}/${batch.length} (failed ${failed}); total profiles ${save.body?.total ?? "—"}`,
    submitted: ok,
    skipped: failed,
  };
}
