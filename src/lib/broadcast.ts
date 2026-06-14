/**
 * Broadcast-report generation via xAI Grok. The editor pastes a news video's
 * transcript; Grok returns a structured end-of-broadcast report card. The
 * shape and prompt mirror the iOS app's BroadcastReview so the website reads
 * as a continuation of the same publication.
 */

export const LETTER_GRADES = [
  "A+", "A", "A-",
  "B+", "B", "B-",
  "C+", "C", "C-",
  "D+", "D", "D-",
  "F",
] as const;

export const KEY_MOMENT_VERDICTS = [
  "verified",
  "disputed",
  "missing context",
  "unsupported",
] as const;

export const POLITICAL_LEANS = [
  "left",
  "center-left",
  "center",
  "center-right",
  "right",
  "none",
] as const;

export interface BroadcastKeyMoment {
  claim: string;
  verdict: (typeof KEY_MOMENT_VERDICTS)[number];
  note: string;
}

export interface BroadcastReport {
  headline: string;
  letterGrade: (typeof LETTER_GRADES)[number];
  factualityScore: number;
  // Signed left↔right axis: -100 = fully left, 0 = center, +100 = fully right.
  leanScore: number;
  politicalLean: (typeof POLITICAL_LEANS)[number];
  leanRationale: string;
  gradeRationale: string;
  topics: string[];
  summary: string;
  assessment: string;
  notableConcerns: string[];
  keyMoments: BroadcastKeyMoment[];
  citations: { title: string; url: string }[];
}

// Map a -100..100 lean score to the legacy bucket (kept for back-compat with
// older posts/UI that reference the enum).
export function leanBucket(score: number): (typeof POLITICAL_LEANS)[number] {
  if (score <= -60) return "left";
  if (score <= -20) return "center-left";
  if (score < 20) return "center";
  if (score < 60) return "center-right";
  return "right";
}

// Ported from the iOS app (GrokClient.broadcastReviewPrompt), adapted: the web
// editor pastes a transcript rather than a live utterance/flag stream, and we
// also ask for a `headline` since the website needs a title per report.
const SYSTEM_PROMPT = `You are the editor of "Clad," a one-editor fact-checking publication. You are reviewing a news broadcast, segment, interview, or media clip. Your job is NOT to repeat the news. Your job is to give the reader the LENS they need: how well the claims hold up, what context they are missing, where the framing leans politically, and what could be skewing their perception of what they just watched. Produce a structured report card.

Respond with a single JSON object of the form:
{
  "headline": "<a concise newspaper headline for this report, <= 90 chars>",
  "letter_grade": "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D+" | "D" | "D-" | "F",
  "factuality_score": <integer 0-100>,
  "grade_rationale": "<one or two sentences on WHY it earned that grade — name the failings, e.g. 'several unsupported claims and missing context on key figures'>",
  "lean_score": <integer -100 to 100>,
  "lean_rationale": "<one or two sentences explaining the lean score>",
  "topics": ["<topic>", ...],
  "summary": "<two short paragraphs, 5-7 sentences total, on what the broadcast was about>",
  "assessment": "<4-6 sentences on overall quality, accuracy, framing, and what the viewer might be missing>",
  "notable_concerns": ["<concern>", ...],
  "key_moments": [
    {
      "claim": "<short paraphrase of a specific claim made>",
      "verdict": "verified" | "disputed" | "missing context" | "unsupported",
      "note": "<one sentence: source, context, or why the verdict>"
    }
  ],
  "citations": [
    { "title": "<source title>", "url": "<working URL>" }
  ]
}

Grading rubric:
  A+ to A-: high accuracy, well-sourced, balanced, minimal issues
  B+ to B-: mostly accurate, a few minor concerns
  C+ to C-: a mix of accurate and problematic claims, noticeable patterns (one-sided sourcing, missing context)
  D+ to D-: significant factual issues, heavy partisan framing, or unsourced major claims
  F: pervasive misinformation or propaganda-level distortion
factuality_score: 0 = entirely false, 50 = mixed, 100 = entirely accurate. Reason about severity, not just count — three minor "missing context" issues isn't the same as one outright false claim on a load-bearing point.
IMPORTANT: use the FULL granularity of the grade. If it's a C-minus, return "C-", not "C". If it's an A-plus, return "A+", not "A". Do not round to the whole letter.

KNOWLEDGE-CUTOFF GUARDRAIL: Do NOT declare that a real company, product, AI model, person, law, or event "does not exist" or is "fabricated" merely because it is unfamiliar to you or postdates your training. New models and products (including those from Anthropic, OpenAI, Google, and others) are released constantly. If a broadcast references something you cannot confirm, treat its existence as plausible and assess the SOURCE's specific claims about it (numbers, quotes, framing) rather than calling the subject itself fake. Only mark something as false/unsupported when there is a concrete, articulable reason — not just absence from your own knowledge.

\`headline\`: a concise, restrained newspaper headline summarizing the report. No clickbait, no exclamation, no political adjectives applied to people.

\`grade_rationale\`: one or two sentences explaining WHY the broadcast earned its letter grade — name the specific failings or strengths (e.g. "Graded C-: several load-bearing claims were unsupported and key statistics lacked context", or "Graded A-: claims were well-sourced to primary data with minor framing concerns"). This is what the reader sees first, so make it concrete, not generic.

\`lean_score\`: an integer from -100 to 100 measuring the political slant of THIS broadcast/source as presented (word choice, which facts are emphasized or omitted, guest selection, framing). -100 = strongly left, 0 = centered / no discernible slant, +100 = strongly right. Use the full range and be precise (e.g. -21 for a mild left tilt, 78 for a strong right tilt). Be even-handed: apply the same standard to every network and figure regardless of side. If the content is not political, use 0.

\`lean_rationale\`: one or two sentences naming the specific cues that drove the lean_score (e.g. "Relied solely on administration officials and framed the policy in its preferred terms"). Keep it factual, not pejorative.

\`topics\`: 2 to 4 SHORT, CANONICAL topic tags (1-3 words each) that will group related stories on a dashboard. Use the plainest common name for the subject and REUSE the same wording across stories about it — e.g. "Iran", "DC crime", "Ukraine war", "Federal Reserve", "Trump health". Avoid long or one-off phrasings ("UFC promotion costs at the South Lawn") — prefer the broad tag ("White House UFC event") so different networks' takes land under the same topic. Skip filler / transitions.

\`summary\`: factual description of what the broadcast was about. Don't editorialize here. Two short paragraphs (5-7 sentences total): the first covers what segments ran and what they were about; the second covers the sourcing approach (named vs anonymous sources, graphics referenced), notable guests/experts, and throughlines. The reader didn't watch it — give them enough to understand what was discussed.

\`assessment\`: editorial, and this is the heart of the report. Explain what context the viewer is MISSING, what could SKEW their perception (loaded language, omitted counter-evidence, selective stats, framing), how well the claims hold up, and any patterns. 4-6 sentences. Be politically balanced.

\`key_moments\`: 3 to 5 specific, scannable moments that capture what was actually reported and how it held up. Each: a short paraphrased claim, a verdict, and a one-sentence note giving source, context, or rationale. Choose the most substantive / load-bearing claims, not throwaway transitions.

\`notable_concerns\`: 1 to 3 standout issues an attentive viewer should know about. Return an empty array if there were none.

\`citations\`: find AS MANY credible, relevant sources as you reasonably can (aim for at least 4-8) — primary sources, official statistics, statutes/filings, named experts, and reputable outlets that corroborate, contradict, or add missing context to the claims. Each must have a real title and a working URL the reader can open. Prefer primary and high-credibility sources; avoid partisan blogs unless they are the subject. More good sources = more credibility for the report. Return an empty array only if you genuinely found none.

Tone: restrained broadsheet, not tabloid. No emoji, no exclamation marks. Adjectives describe evidence ("documented", "unsubstantiated"), not people. Verdicts key off documents, statutes, primary data, and named sources. Where evidence is genuinely thin, prefer "missing context" or "unsupported" over guessing.

If the content is too sparse to evaluate, do not force a failing grade — pick the grade that reflects the limited content, set factuality_score to 50, and say so plainly in the summary.

Return ONLY the JSON object, no markdown fence and no commentary.`;

// Transcript path: proven chat/completions + grok-4. Web-search path: the
// Responses API (/v1/responses), which is where xAI's server-side agentic
// tools live, with grok-4.3 (the model xAI documents for web_search).
const CHAT_MODEL = "grok-4";
const SEARCH_MODEL = "grok-4.3";

// Added to the system prompt when no transcript is supplied and the model must
// research the video itself via web search.
const WEB_SEARCH_ADDENDUM = `

No transcript was provided — you are given a YouTube URL. Use web search to research THAT SPECIFIC video: find its transcript or captions, the channel's own description, and reputable coverage of what was said. Identify the exact video (match the title/channel if given). Base your report on what the video actually contains, not on the topic in general.

If you cannot find enough reliable information about the actual content of this specific video, do NOT fabricate claims. Instead set factuality_score to 50, choose a grade reflecting the uncertainty, and state plainly in the summary that the video's content could not be independently verified and the editor should supply a transcript.`;

// JSON Schema for the Responses-API structured output (snake_case to match the
// prompt's contract; normalizeBroadcast maps it to our camelCase shape).
const REPORT_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    letter_grade: { type: "string", enum: [...LETTER_GRADES] },
    factuality_score: { type: "integer", minimum: 0, maximum: 100 },
    grade_rationale: { type: "string" },
    lean_score: { type: "integer", minimum: -100, maximum: 100 },
    lean_rationale: { type: "string" },
    topics: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    assessment: { type: "string" },
    notable_concerns: { type: "array", items: { type: "string" } },
    key_moments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          verdict: { type: "string", enum: [...KEY_MOMENT_VERDICTS] },
          note: { type: "string" },
        },
        required: ["claim", "verdict", "note"],
        additionalProperties: false,
      },
    },
    citations: {
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
    "headline",
    "letter_grade",
    "factuality_score",
    "grade_rationale",
    "lean_score",
    "lean_rationale",
    "topics",
    "summary",
    "assessment",
    "notable_concerns",
    "key_moments",
    "citations",
  ],
  additionalProperties: false,
} as const;

export async function generateBroadcastReport(
  apiKey: string,
  input: {
    transcript?: string;
    sourceUrl: string;
    videoTitle?: string;
    channel?: string;
    notes?: string;
  }
): Promise<BroadcastReport> {
  const hasTranscript = !!input.transcript && input.transcript.trim().length >= 80;

  const userMessage = [
    input.videoTitle ? `Video title: ${input.videoTitle}` : "",
    input.channel ? `Channel: ${input.channel}` : "",
    `Source URL: ${input.sourceUrl}`,
    input.notes ? `Editor notes: ${input.notes}` : "",
    "",
    hasTranscript ? "Transcript:" : "No transcript provided — research the video at the Source URL.",
    hasTranscript ? input.transcript!.trim() : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const raw = hasTranscript
    ? await callChat(apiKey, SYSTEM_PROMPT, userMessage)
    : await callResponsesWithSearch(apiKey, SYSTEM_PROMPT + WEB_SEARCH_ADDENDUM, userMessage);

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("xAI did not return valid JSON.");
  }
  const report = normalizeBroadcast(parsed);

  // Ground the citations in a real web search so they're plentiful and resolve
  // (the transcript path has no web access and otherwise invents URLs). Merge
  // grounded sources first, then any the report already produced; dedupe by URL.
  try {
    const grounded = await gatherCitations(apiKey, report);
    if (grounded.length > 0) {
      const seen = new Set<string>();
      const merged: { title: string; url: string }[] = [];
      for (const c of [...grounded, ...report.citations]) {
        const key = c.url.replace(/\/+$/, "").toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(c);
        }
      }
      report.citations = merged.slice(0, 18);
    }
  } catch {
    // keep the report's own citations if the grounding pass fails
  }

  return report;
}

const REVISE_ADDENDUM = `

You are REVISING an existing report based on EDITOR FEEDBACK. You are given the current report (JSON) and the editor's notes describing what is wrong with it.

Treat the editor's correction as AUTHORITATIVE and factually correct. If the editor says something exists, is true, or is false, accept that and fix every part of the report that contradicts it — including the headline, summary, assessment, key moments, notable concerns, the letter grade, the factuality score, and the rationales. A common case: you may have wrongly claimed a real product, company, model, person, or event does not exist — if the editor corrects you, accept it and re-grade accordingly (do not penalize the source for a claim that is actually true).

Keep everything the editor did NOT flag intact. Return the COMPLETE corrected report in the same JSON schema.`;

/**
 * Re-run Grok over an existing report with editor feedback, returning a
 * corrected report. Used by the pending-queue "flag for revision" flow.
 */
export async function reviseBroadcastReport(
  apiKey: string,
  input: {
    report: BroadcastReport;
    feedback: string;
    sourceUrl: string;
    videoTitle?: string;
    channel?: string;
  }
): Promise<BroadcastReport> {
  const userMessage = [
    input.videoTitle ? `Video title: ${input.videoTitle}` : "",
    input.channel ? `Channel: ${input.channel}` : "",
    `Source URL: ${input.sourceUrl}`,
    "",
    "EDITOR FEEDBACK (authoritative — correct the report to address this):",
    input.feedback.trim(),
    "",
    "CURRENT REPORT (JSON to revise):",
    JSON.stringify(input.report),
  ]
    .filter((l) => l !== "")
    .join("\n");

  const raw = await callChat(apiKey, SYSTEM_PROMPT + REVISE_ADDENDUM, userMessage);
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("xAI did not return valid JSON.");
  }
  const revised = normalizeBroadcast(parsed);
  // Preserve the original citations if the revision dropped them.
  if (revised.citations.length === 0) revised.citations = input.report.citations;
  return revised;
}

async function callChat(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`xAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 400)}`);
  const data: any = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new Error("xAI returned no message content.");
  return raw;
}

async function callResponsesWithSearch(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [{ type: "web_search" }],
      text: {
        format: {
          type: "json_schema",
          name: "broadcast_report",
          schema: REPORT_SCHEMA,
          strict: true,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`xAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 400)}`);
  const data: any = await res.json();
  const text = extractResponsesText(data);
  if (!text) throw new Error("xAI returned no output text.");
  return text;
}

const CITATIONS_SCHEMA = {
  type: "object",
  properties: {
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, url: { type: "string" } },
        required: ["title", "url"],
        additionalProperties: false,
      },
    },
  },
  required: ["citations"],
  additionalProperties: false,
} as const;

// Web-search pass to gather REAL, working sources for the report's claims, so
// the citation list is plentiful and resolves (the report model alone, with no
// browsing, tends to invent URLs that 404).
async function gatherCitations(
  apiKey: string,
  report: BroadcastReport
): Promise<{ title: string; url: string }[]> {
  const claims = report.keyMoments.map((m) => `- ${m.claim}`).join("\n");
  const system = `You are Clad's research desk. Using web search, find AS MANY credible, currently-working sources as you can (aim for 8-15) that corroborate, contradict, or add essential context to the report below. Rules:
- Only include URLs you actually found via search and that load — do NOT guess or fabricate URLs or deep paths.
- Prefer primary sources (official data, agency pages, filings, statutes, court records), named experts, and reputable news outlets across the spectrum.
- Each entry needs an accurate title and a working URL.
Return ONLY JSON: { "citations": [ { "title": string, "url": string } ] }`;
  const user = `Headline: ${report.headline}
Topics: ${report.topics.join(", ")}
Summary: ${report.summary}
Key claims:
${claims}`;

  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [{ type: "web_search" }],
      text: { format: { type: "json_schema", name: "citation_list", schema: CITATIONS_SCHEMA, strict: true } },
    }),
  });
  if (!res.ok) return [];
  const data: any = await res.json();
  const text = extractResponsesText(data);
  if (!text) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed?.citations)) return [];
  return parsed.citations
    .map((c: any) => ({ title: String(c?.title ?? "").trim(), url: String(c?.url ?? "").trim() }))
    .filter((c: { title: string; url: string }) => c.title && /^https?:\/\//.test(c.url))
    .slice(0, 18);
}

/** Pull the assistant's text out of a /v1/responses payload. */
function extractResponsesText(data: any): string | null {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") {
        return c.text;
      }
    }
  }
  return null;
}

export function normalizeBroadcast(p: any): BroadcastReport {
  const grade = (LETTER_GRADES as readonly string[]).includes(p?.letter_grade)
    ? p.letter_grade
    : "C";

  let score = Number(p?.factuality_score);
  if (!Number.isFinite(score)) score = 50;
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Prefer the new numeric lean_score; fall back to the legacy enum if a caller
  // still sends one.
  let leanScore = Number(p?.lean_score);
  if (!Number.isFinite(leanScore)) {
    const enumScore: Record<string, number> = {
      left: -80, "center-left": -40, center: 0, "center-right": 40, right: 80, none: 0,
    };
    leanScore = enumScore[p?.political_lean] ?? 0;
  }
  leanScore = Math.max(-100, Math.min(100, Math.round(leanScore)));

  const topics = toStringArray(p?.topics).slice(0, 4);
  const notableConcerns = toStringArray(p?.notable_concerns).slice(0, 3);

  const keyMoments: BroadcastKeyMoment[] = Array.isArray(p?.key_moments)
    ? p.key_moments
        .map((m: any) => ({
          claim: String(m?.claim ?? "").trim(),
          verdict: (KEY_MOMENT_VERDICTS as readonly string[]).includes(m?.verdict)
            ? (m.verdict as BroadcastKeyMoment["verdict"])
            : ("unsupported" as const),
          note: String(m?.note ?? "").trim(),
        }))
        .filter((m: BroadcastKeyMoment) => m.claim.length > 0)
        .slice(0, 6)
    : [];

  const citations: { title: string; url: string }[] = Array.isArray(p?.citations)
    ? p.citations
        .map((c: any) => ({
          title: String(c?.title ?? "").trim(),
          url: String(c?.url ?? "").trim(),
        }))
        .filter((c: { title: string; url: string }) => c.title && /^https?:\/\//.test(c.url))
        .slice(0, 12)
    : [];

  return {
    headline: String(p?.headline ?? "").trim().slice(0, 200),
    letterGrade: grade as BroadcastReport["letterGrade"],
    factualityScore: score,
    leanScore,
    politicalLean: leanBucket(leanScore),
    leanRationale: String(p?.lean_rationale ?? "").trim(),
    gradeRationale: String(p?.grade_rationale ?? "").trim(),
    topics,
    summary: String(p?.summary ?? "").trim(),
    assessment: String(p?.assessment ?? "").trim(),
    notableConcerns,
    keyMoments,
    citations,
  };
}

function toStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((s) => String(s ?? "").trim()).filter(Boolean);
}
