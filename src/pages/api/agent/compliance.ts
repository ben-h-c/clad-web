import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import {
  publishedPostsContent,
  setComplianceReport,
  type ComplianceFinding,
  type ComplianceReport,
  type RiskLevel,
} from "~/lib/agents";

export const prerender = false;

// The canonical site-wide disclaimer (rendered by Disclaimer.astro on every
// page). Sent to the auditor so it can judge whether coverage is adequate.
const SITE_DISCLAIMER =
  "Clad's reports are editorial commentary, opinion, and analysis based on publicly " +
  "available material (including news broadcasts referenced under fair use for commentary " +
  "and criticism). Letter grades and verdicts assess the evidence and reporting, not the " +
  "character of any person named. Quotations are paraphrased from source transcripts and " +
  "may contain errors; every report links to its original source. Corrections are issued " +
  "as new posts, never silent edits.";

// GET — full post content for the auditor to review.
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const posts = await publishedPostsContent();
  return json({ disclaimer: SITE_DISCLAIMER, posts }, 200);
};

// POST — store the auditor's report.
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const report: ComplianceReport = {
    generatedAt: new Date().toISOString(),
    overallRisk: risk(p?.overallRisk),
    summary: str(p?.summary).slice(0, 1200),
    postsAudited: Number(p?.postsAudited) || 0,
    disclaimer: {
      present: Boolean(p?.disclaimer?.present),
      adequate: Boolean(p?.disclaimer?.adequate),
      notes: str(p?.disclaimer?.notes).slice(0, 1200),
      suggestions: toStrArr(p?.disclaimer?.suggestions).slice(0, 10),
    },
    findings: Array.isArray(p?.findings)
      ? p.findings.slice(0, 200).map(normFinding)
      : [],
  };

  await setComplianceReport(env.AGENTS, report);
  return json({ ok: true, findings: report.findings.length }, 200);
};

function normFinding(f: any): ComplianceFinding {
  return {
    postId: str(f?.postId),
    postUrl: str(f?.postUrl),
    headline: str(f?.headline).slice(0, 300),
    severity: risk(f?.severity),
    category: str(f?.category).slice(0, 80) || "General",
    quote: str(f?.quote).slice(0, 600),
    issue: str(f?.issue).slice(0, 800),
    suggestion: str(f?.suggestion).slice(0, 800),
  };
}

function risk(v: unknown): RiskLevel {
  return v === "high" || v === "medium" || v === "low" ? v : "low";
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function toStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : [];
}
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
