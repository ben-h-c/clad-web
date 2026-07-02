import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAuditContent, putComplianceReport } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUBRIC_PATH = path.join(__dirname, "legalRubric.md");

// Live pages to pull into the holistic review (the site's legal-facing docs).
const SITE_PAGES = [
  { url: "/privacy/", label: "Privacy Policy" },
  { url: "/terms/", label: "Terms of Use" },
  { url: "/about/", label: "About" },
];

const SYSTEM_BASE = `You are a U.S. media-law compliance reviewer for "Clad/CladFacts," a political
fact-checking website. Your job is to flag legal risk so the publisher does not get sued. You are
reviewing the ENTIRE SITE holistically — its privacy policy, terms of use, about page, the
site-wide disclaimer, the published reports, AND the Good News page's curated collections — at the
same time, so you can catch both per-item problems and cross-document inconsistencies (e.g. a
privacy-policy promise the site doesn't keep, or a post whose damaging claim the disclaimer
doesn't cover). For the Good News collections, check curation integrity: every item must plainly
match its collection's stated title and blurb, and nothing somber, divisive, or grim belongs on
that page at all.

Use the following rubric as your checklist. Audit against EVERY relevant category.

=== LEGAL RUBRIC ===
{{RUBRIC}}
=== END RUBRIC ===

Use web search to verify any damaging factual claim about a real, identifiable person or company
before judging its defamation risk, and to sanity-check whether the privacy policy's promises match
how a site like this actually behaves.

Be practical and specific. Only raise a finding when there is a real, articulable risk — never
invent issues. For each finding: quote the exact at-risk text, say WHERE it appears (use the page
label or the post headline), explain the risk in 1–2 sentences, and give a concrete minimal fix.
Severity: "high" = likely actionable; "medium" = should fix; "low" = best-practice. This is
automated risk-spotting, NOT legal advice.

For findings on a site page, set postUrl to the page path (e.g. "/privacy/") and headline to the
page label. For findings on a report, set postId/postUrl/headline from that post. For findings on
a Good News collection, set postUrl to "/good-news/" and headline to the collection title.`;

const SCHEMA = {
  type: "object",
  properties: {
    overallRisk: { type: "string", enum: ["high", "medium", "low"] },
    summary: { type: "string" },
    disclaimer: {
      type: "object",
      properties: {
        present: { type: "boolean" },
        adequate: { type: "boolean" },
        notes: { type: "string" },
        suggestions: { type: "array", items: { type: "string" } },
      },
      required: ["present", "adequate", "notes", "suggestions"],
      additionalProperties: false,
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          postId: { type: "string" },
          postUrl: { type: "string" },
          headline: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          category: { type: "string" },
          quote: { type: "string" },
          issue: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["postId", "postUrl", "headline", "severity", "category", "quote", "issue", "suggestion"],
        additionalProperties: false,
      },
    },
  },
  required: ["overallRisk", "summary", "disclaimer", "findings"],
  additionalProperties: false,
};

export async function runComplianceAuditor(agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY not set" };

  const max = agent.config?.maxPostsToAudit || 40;
  const base = process.env.WORKER_BASE_URL || "https://cladfacts.com";

  let rubric = "";
  try {
    rubric = fs.readFileSync(RUBRIC_PATH, "utf8");
  } catch {
    return { ok: false, message: "legalRubric.md not found" };
  }

  const res = await getAuditContent();
  if (!res.ok) return { ok: false, message: `content fetch ${res.status}` };
  const allPosts = res.body.posts || [];
  const disclaimer = res.body.disclaimer || "";
  const posts = allPosts.slice(0, max);

  // Pull the site's legal-facing pages as plain text (holistic review).
  const pages = [];
  for (const p of SITE_PAGES) {
    try {
      const r = await fetch(base + p.url);
      if (r.ok) pages.push({ ...p, text: htmlToText(await r.text()).slice(0, 6000) });
    } catch {
      // skip a page that can't be fetched
    }
  }

  const system = SYSTEM_BASE.replace("{{RUBRIC}}", rubric);
  const user = JSON.stringify({
    siteDisclaimer: disclaimer,
    sitePages: pages.map((p) => ({ url: p.url, label: p.label, text: p.text })),
    goodNews: res.body.goodNews || [],
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
      sourceTitle: p.sourceTitle,
      citationCount: p.citationCount,
      body: (p.body || "").slice(0, 1500),
    })),
  });

  let parsed;
  try {
    const raw = await callResponses(xaiKey, system, user);
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
    message: `audited ${posts.length} posts + ${pages.length} pages · ${report.findings.length} findings (${high} high) · risk ${report.overallRisk}`,
    submitted: report.findings.length,
  };
}

// Strip a rendered HTML page down to readable text for the auditor.
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function callResponses(apiKey, system, user) {
  const res = await fetch(XAI_RESPONSES, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // No web search — the audit reviews our own posts + policies (provided in
      // the prompt); live browsing isn't needed and was a recurring cost.
      text: { format: { type: "json_schema", name: "compliance_report", schema: SCHEMA, strict: true } },
    }),
  });
  if (!res.ok) {
    throw new Error(`xAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  const data = await res.json();
  const text = extractText(data);
  if (!text) throw new Error("xAI returned no content");
  return text;
}

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") return c.text;
    }
  }
  return null;
}
