/**
 * Minimal xAI Grok client for the fact-check endpoint.
 *
 * Returns a strict JSON shape:
 *   { verdict, summary, body, citations: [{title, url}] }
 *
 * The model is told to set verdict to "unverified" when evidence is thin,
 * rather than guessing. That keeps the editor (Ben) in the loop instead of
 * letting Grok manufacture confidence.
 */

export interface FactCheckResult {
  verdict:
    | "true"
    | "mostly-true"
    | "mixed"
    | "mostly-false"
    | "false"
    | "unverified";
  summary: string;
  body: string;
  citations: { title: string; url: string }[];
}

const SYSTEM_PROMPT = `You are the research desk of "Clad," a one-editor fact-checking publication.

Your job: take a single headline and (optional) source URL, find primary sources, and return a structured fact-check. You are NOT writing a finished article. You're writing an editor's brief.

Rules:
- Verdict vocabulary (use EXACTLY one): "true", "mostly-true", "mixed", "mostly-false", "false", "unverified".
- "unverified" means: evidence is too thin, too partisan, or too recent to call. Use it freely. Do not guess.
- Cite primary sources where possible (statutes, filings, official statistics, named eyewitnesses, peer-reviewed papers). Wikipedia and partisan outlets are last-resort.
- 3-5 citations. Each must have a real title and a real URL the editor can open.
- Tone is restrained editorial, not tabloid. No emoji, no exclamation marks, no political adjectives ("dangerous", "shocking"). Adjectives describe evidence ("documented", "unsubstantiated"), not actors.
- "body" should be 2-4 short paragraphs of plain prose suitable for a report page. Lead with the strongest piece of evidence.
- Do NOT include the headline in the body.

Return ONLY a JSON object matching this TypeScript type, with no markdown fence and no commentary:

{
  "verdict": "true" | "mostly-true" | "mixed" | "mostly-false" | "false" | "unverified",
  "summary": string,   // one-sentence editor's-summary, <= 240 chars
  "body": string,      // 2-4 paragraphs, plain text, \\n\\n between paragraphs
  "citations": [{ "title": string, "url": string }]
}`;

export async function factCheck(
  apiKey: string,
  input: { headline: string; sourceUrl?: string; notes?: string }
): Promise<FactCheckResult> {
  const userMessage = [
    `Headline: ${input.headline}`,
    input.sourceUrl ? `Source URL: ${input.sourceUrl}` : "",
    input.notes ? `Editor notes: ${input.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`xAI ${res.status}: ${text.slice(0, 400)}`);
  }

  const data: any = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") {
    throw new Error("xAI returned no message content.");
  }
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("xAI did not return valid JSON.");
  }
  return normalize(parsed);
}

function normalize(p: any): FactCheckResult {
  const allowed = [
    "true",
    "mostly-true",
    "mixed",
    "mostly-false",
    "false",
    "unverified",
  ];
  const verdict = allowed.includes(p?.verdict) ? p.verdict : "unverified";
  const citations = Array.isArray(p?.citations)
    ? p.citations
        .filter((c: any) => c && typeof c.title === "string" && typeof c.url === "string")
        .slice(0, 8)
    : [];
  return {
    verdict,
    summary: String(p?.summary ?? "").slice(0, 400),
    body: String(p?.body ?? ""),
    citations,
  };
}
