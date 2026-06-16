import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { commitFile, getFile } from "~/lib/github";
import { getComplianceReport, removeComplianceFinding } from "~/lib/agents";

export const prerender = false;

// Map a finding's location to a repo file.
const PAGE_FILES: Record<string, string> = {
  "/privacy/": "src/pages/privacy.astro",
  "/terms/": "src/pages/terms.astro",
  "/about/": "src/pages/about.astro",
};

const EDIT_SCHEMA = {
  type: "object",
  properties: {
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: { find: { type: "string" }, replace: { type: "string" } },
        required: ["find", "replace"],
        additionalProperties: false,
      },
    },
    note: { type: "string" },
  },
  required: ["edits", "note"],
  additionalProperties: false,
} as const;

const SYSTEM = `You apply ONE specific, minimal legal-risk fix to a source file. You are given the full file content and a finding: the at-risk quote, the legal risk, and the suggested fix. Produce a list of exact string find/replace edits that implement the suggested fix and NOTHING else.

Rules:
- Each "find" MUST be a verbatim substring copied exactly from the file (exact punctuation, casing, and whitespace), short but unique enough to match one place.
- "replace" is the corrected text.
- Make the SMALLEST change that resolves the risk — e.g. add attribution ("according to <source>"), change a flat assertion to "allegedly"/"reportedly", add a hedge, or correct/remove an inaccurate statement.
- Do NOT reformat or touch unrelated text. Preserve markdown/frontmatter/JSX structure.
- If the at-risk text is not actually present in the file, return an empty edits array.
Return ONLY JSON: { "edits": [ { "find": "...", "replace": "..." } ], "note": "one short sentence on what you changed" }.`;

export const POST: APIRoute = async ({ request }) => {
  if (!env.XAI_API_KEY) return json({ error: "XAI_API_KEY not configured" }, 503);
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.GITHUB_BRANCH) {
    return json({ error: "GitHub is not configured." }, 503);
  }

  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (p?.action !== "apply") return json({ error: "Unknown action" }, 400);
  const id = String(p?.id ?? "");
  if (!id) return json({ error: "Missing finding id" }, 400);

  const report = await getComplianceReport(env.AGENTS);
  const finding = report?.findings.find((f) => f.id === id);
  if (!finding) return json({ error: "Finding not found (re-run the audit?)" }, 404);

  const path = targetPath(finding);
  if (!path) return json({ error: "Can't map this finding to a file to edit." }, 422);

  const ref = { token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH, path };
  const file = await getFile(ref);
  if (!file) return json({ error: `File not found: ${path}` }, 404);

  let edits: { find: string; replace: string }[];
  let note = "";
  try {
    const out = await proposeEdits(env.XAI_API_KEY, file.contents, finding);
    edits = out.edits;
    note = out.note;
  } catch (err: any) {
    return json({ error: err?.message ?? "Could not propose a fix" }, 502);
  }

  let updated = file.contents;
  let applied = 0;
  for (const e of edits) {
    if (e.find && updated.includes(e.find)) {
      updated = updated.replace(e.find, e.replace);
      applied++;
    }
  }
  if (applied === 0 || updated === file.contents) {
    return json(
      { error: "Couldn't apply automatically — the exact text wasn't found. Edit the post/page manually." },
      422
    );
  }

  try {
    await commitFile({ ...ref, contents: updated, message: `compliance fix (${finding.category}): ${path}` });
  } catch (err: any) {
    return json({ error: err?.message ?? "Commit failed" }, 502);
  }

  await removeComplianceFinding(env.AGENTS, id);
  return json({ ok: true, file: path, applied, note }, 200);
};

function targetPath(f: { postId?: string; postUrl?: string }): string | null {
  if (f.postUrl && PAGE_FILES[f.postUrl]) return PAGE_FILES[f.postUrl];
  const id = (f.postId || "").trim();
  if (id && !id.includes("..") && !id.includes("/")) return `src/content/posts/${id}.md`;
  const m = (f.postUrl || "").match(/^\/posts\/([^/]+)\/?$/);
  if (m && !m[1].includes("..")) return `src/content/posts/${m[1]}.md`;
  return null;
}

async function proposeEdits(
  apiKey: string,
  fileContents: string,
  finding: { quote: string; issue: string; suggestion: string; category: string }
): Promise<{ edits: { find: string; replace: string }[]; note: string }> {
  const user = JSON.stringify({
    file: fileContents,
    finding: {
      category: finding.category,
      atRiskQuote: finding.quote,
      risk: finding.issue,
      suggestedFix: finding.suggestion,
    },
  });
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "grok-4.3",
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      text: { format: { type: "json_schema", name: "edits", schema: EDIT_SCHEMA, strict: true } },
    }),
  });
  if (!res.ok) throw new Error(`xAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data: any = await res.json();
  const text = extractText(data);
  if (!text) throw new Error("xAI returned no content");
  const parsed = JSON.parse(text);
  const edits = Array.isArray(parsed?.edits)
    ? parsed.edits
        .map((e: any) => ({ find: String(e?.find ?? ""), replace: String(e?.replace ?? "") }))
        .filter((e: any) => e.find)
        .slice(0, 8)
    : [];
  return { edits, note: String(parsed?.note ?? "") };
}

function extractText(data: any): string | null {
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

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
