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

export interface BroadcastKeyMoment {
  claim: string;
  verdict: (typeof KEY_MOMENT_VERDICTS)[number];
  note: string;
}

export interface BroadcastReport {
  headline: string;
  letterGrade: (typeof LETTER_GRADES)[number];
  factualityScore: number;
  topics: string[];
  summary: string;
  assessment: string;
  notableConcerns: string[];
  keyMoments: BroadcastKeyMoment[];
}

// Ported from the iOS app (GrokClient.broadcastReviewPrompt), adapted: the web
// editor pastes a transcript rather than a live utterance/flag stream, and we
// also ask for a `headline` since the website needs a title per report.
const SYSTEM_PROMPT = `You are the editor of "Clad," a one-editor fact-checking publication. You are reviewing a news broadcast (a TV segment, interview, or news video) from its transcript. Produce a structured end-of-broadcast report card.

Respond with a single JSON object of the form:
{
  "headline": "<a concise newspaper headline for this report, <= 90 chars>",
  "letter_grade": "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D+" | "D" | "D-" | "F",
  "factuality_score": <integer 0-100>,
  "topics": ["<topic>", ...],
  "summary": "<two short paragraphs, 5-7 sentences total, on what the broadcast was about>",
  "assessment": "<4-6 sentences on overall quality, accuracy, and any patterns>",
  "notable_concerns": ["<concern>", ...],
  "key_moments": [
    {
      "claim": "<short paraphrase of a specific claim made>",
      "verdict": "verified" | "disputed" | "missing context" | "unsupported",
      "note": "<one sentence: source, context, or why the verdict>"
    }
  ]
}

Grading rubric:
  A+ to A-: high accuracy, well-sourced, balanced, minimal issues
  B+ to B-: mostly accurate, a few minor concerns
  C+ to C-: a mix of accurate and problematic claims, noticeable patterns (one-sided sourcing, missing context)
  D+ to D-: significant factual issues, heavy partisan framing, or unsourced major claims
  F: pervasive misinformation or propaganda-level distortion
factuality_score: 0 = entirely false, 50 = mixed, 100 = entirely accurate. Reason about severity, not just count — three minor "missing context" issues isn't the same as one outright false claim on a load-bearing point.

\`headline\`: a concise, restrained newspaper headline summarizing the report. No clickbait, no exclamation, no political adjectives applied to people.

\`topics\`: 2 to 4 short topic labels covered ("Federal Reserve policy", "Ukraine war updates"). Skip filler / transitions.

\`summary\`: factual description of what the broadcast was about. Don't editorialize here. Two short paragraphs (5-7 sentences total): the first covers what segments ran and what they were about; the second covers the sourcing approach (named vs anonymous sources, graphics referenced), notable guests/experts, and throughlines. The reader didn't watch it — give them enough to understand what was discussed.

\`assessment\`: editorial. Note overall accuracy, sourcing quality, balance, any patterns (consistent partisan framing, over-reliance on anonymous sources, sensational stakes). 4-6 sentences. Be politically balanced — apply the same standard regardless of network or partisan position.

\`key_moments\`: 3 to 5 specific, scannable moments that capture what was actually reported and how it held up. Each: a short paraphrased claim, a verdict, and a one-sentence note giving source, context, or rationale. Choose the most substantive / load-bearing claims, not throwaway transitions.

\`notable_concerns\`: 1 to 3 standout issues an attentive viewer should know about. Return an empty array if there were none.

Tone: restrained broadsheet, not tabloid. No emoji, no exclamation marks. Adjectives describe evidence ("documented", "unsubstantiated"), not people. Verdicts key off documents, statutes, primary data, and named sources. Where evidence is genuinely thin, prefer "missing context" or "unsupported" over guessing.

If the transcript is too sparse to evaluate, return letter_grade "F" is WRONG — instead pick the grade that reflects the limited content, set factuality_score to 50, and say so plainly in the summary.

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
  },
  required: [
    "headline",
    "letter_grade",
    "factuality_score",
    "topics",
    "summary",
    "assessment",
    "notable_concerns",
    "key_moments",
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
  return normalizeBroadcast(parsed);
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

  return {
    headline: String(p?.headline ?? "").trim().slice(0, 200),
    letterGrade: grade as BroadcastReport["letterGrade"],
    factualityScore: score,
    topics,
    summary: String(p?.summary ?? "").trim(),
    assessment: String(p?.assessment ?? "").trim(),
    notableConcerns,
    keyMoments,
  };
}

function toStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((s) => String(s ?? "").trim()).filter(Boolean);
}
