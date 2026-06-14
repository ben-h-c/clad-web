import { getAuditContent, putComplianceReport } from "./api.mjs";

const XAI_CHAT = "https://api.x.ai/v1/chat/completions";
const MODEL = "grok-4";

const SYSTEM = `You are a U.S. media-law compliance reviewer for "Clad," a political fact-checking
publication. Your sole job is to flag legal risk so the publisher does not get sued.

Review each published report for:
- Defamation / libel: statements of FACT about an identifiable living person or company that
  could be false and reputationally damaging, asserted WITHOUT attribution, hedging, or a
  cited source. Opinion and clearly-labeled analysis are protected; unhedged factual claims
  of wrongdoing/crime are the danger.
- Statements that assert someone committed a crime, fraud, or misconduct without a cited source.
- Privacy: publishing private facts about non-public figures.
- Copyright: reproducing large verbatim copyrighted text (short quotes for commentary are fair use).
- Missing or inadequate disclaimers / attribution.

Be practical and specific. Only raise a finding when there is a real, articulable risk — do not
invent issues. For each finding, quote the exact at-risk text, explain the risk in one or two
sentences, and give a concrete, minimal fix (e.g. add attribution "according to X", soften an
assertion to an allegation, add a source, or add a hedge). Severity: "high" = likely actionable
if false; "medium" = should be fixed; "low" = minor / best-practice.

Also assess whether the site-wide disclaimer (provided) adequately covers the content.

This is automated risk-spotting, NOT legal advice.

Return ONLY JSON of this exact shape:
{
  "overallRisk": "high" | "medium" | "low",
  "summary": "2-4 sentence plain-language overview of the site's legal exposure",
  "disclaimer": {
    "present": true,
    "adequate": true | false,
    "notes": "assessment of the disclaimer",
    "suggestions": ["concrete additions if any"]
  },
  "findings": [
    {
      "postId": "<the id field from the post>",
      "postUrl": "<the url field from the post>",
      "headline": "<the post headline>",
      "severity": "high" | "medium" | "low",
      "category": "Defamation risk" | "Missing attribution" | "Privacy" | "Copyright" | "Disclaimer" | "Other",
      "quote": "the exact at-risk text",
      "issue": "why it is a legal risk",
      "suggestion": "the concrete fix"
    }
  ]
}
If a report is clean, do not invent findings for it. Return an empty findings array if nothing is at risk.`;

export async function runComplianceAuditor(agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY not set" };

  const max = agent.config?.maxPostsToAudit || 60;

  const res = await getAuditContent();
  if (!res.ok) return { ok: false, message: `content fetch ${res.status}` };
  const allPosts = res.body.posts || [];
  const disclaimer = res.body.disclaimer || "";
  const posts = allPosts.slice(0, max);
  if (posts.length === 0) {
    await putComplianceReport({
      overallRisk: "low",
      summary: "No published posts to audit.",
      postsAudited: 0,
      disclaimer: { present: Boolean(disclaimer), adequate: true, notes: "", suggestions: [] },
      findings: [],
    });
    return { ok: true, message: "no posts to audit", submitted: 0 };
  }

  const user = JSON.stringify({
    siteDisclaimer: disclaimer,
    posts: posts.map((p) => ({
      id: p.id,
      url: p.url,
      type: p.type,
      headline: p.headline,
      kicker: p.kicker,
      summary: p.summary,
      verdict: p.verdict,
      assessment: p.assessment,
      notableConcerns: p.notableConcerns,
      keyMoments: p.keyMoments,
      sourceUrl: p.sourceUrl,
      sourceTitle: p.sourceTitle,
      citationCount: p.citationCount,
      body: p.body,
    })),
  });

  let parsed;
  try {
    const raw = await callChat(xaiKey, SYSTEM, user);
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, message: `audit failed: ${String(err?.message || err).slice(0, 200)}` };
  }

  const report = {
    overallRisk: parsed.overallRisk || "low",
    summary: parsed.summary || "",
    postsAudited: posts.length,
    disclaimer: {
      present: parsed.disclaimer?.present ?? Boolean(disclaimer),
      adequate: parsed.disclaimer?.adequate ?? true,
      notes: parsed.disclaimer?.notes || "",
      suggestions: parsed.disclaimer?.suggestions || [],
    },
    findings: Array.isArray(parsed.findings) ? parsed.findings : [],
  };

  const out = await putComplianceReport(report);
  if (!out.ok) return { ok: false, message: `report store ${out.status}` };

  const high = report.findings.filter((f) => f.severity === "high").length;
  return {
    ok: true,
    message: `audited ${posts.length} posts · ${report.findings.length} findings (${high} high) · risk ${report.overallRisk}`,
    submitted: report.findings.length,
  };
}

async function callChat(apiKey, system, user) {
  const res = await fetch(XAI_CHAT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`xAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new Error("xAI returned no content");
  return raw;
}
