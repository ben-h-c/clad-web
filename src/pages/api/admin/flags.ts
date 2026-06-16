import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { commitFile, getFile } from "~/lib/github";
import { deleteFlag, getFlag, setFlagStatus } from "~/lib/agents";
import { generateBroadcastReport, leanBucket } from "~/lib/broadcast";

export const prerender = false;

// Review reader flags: mark reviewed (read, no change), delete, or re-grade the
// post with AI — re-evaluating the grade/lean while weighing (not blindly
// trusting) the reader's note, then patching the live post's frontmatter.
export const POST: APIRoute = async ({ request }) => {
  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = String(p?.action ?? "");
  const id = String(p?.id ?? "").trim();
  if (!id) return json({ error: "Missing flag id" }, 400);

  const flag = await getFlag(env.AGENTS, id);
  if (!flag) return json({ error: "Flag not found" }, 404);

  if (action === "delete") {
    await deleteFlag(env.AGENTS, id);
    return json({ ok: true }, 200);
  }

  if (action === "review") {
    await setFlagStatus(env.AGENTS, id, "reviewed");
    return json({ ok: true }, 200);
  }

  if (action === "regrade") {
    if (!env.XAI_API_KEY) return json({ error: "XAI_API_KEY not configured" }, 503);
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.GITHUB_BRANCH) {
      return json({ error: "GitHub is not configured." }, 503);
    }
    const postId = flag.postId;
    if (postId.includes("..") || postId.includes("/")) return json({ error: "Bad post id" }, 400);
    const ref = {
      token: env.GITHUB_TOKEN,
      repo: env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH,
      path: `src/content/posts/${postId}.md`,
    };
    const file = await getFile(ref);
    if (!file) return json({ error: "Post file not found" }, 404);

    const m = file.contents.match(/^---\n([\s\S]*?)\n---/);
    if (!m) return json({ error: "Could not parse frontmatter" }, 422);
    const fm = m[1]!;
    const sourceUrl = readStr(fm, "sourceUrl") ?? "";
    const videoTitle = readStr(fm, "videoTitle") ?? undefined;
    const channel = readStr(fm, "sourceTitle") ?? undefined;
    const oldGrade = readStr(fm, "letterGrade") ?? "—";
    const oldLean = readNum(fm, "leanScore");
    if (!sourceUrl) return json({ error: "Post has no source URL to re-grade" }, 422);

    const aspectPhrase =
      flag.aspect === "grade"
        ? "the letter grade"
        : flag.aspect === "lean"
          ? "the political-lean rating"
          : "the grade and the political-lean rating";
    const note =
      `A reader disputes ${aspectPhrase} assigned to this report. Their argument:\n` +
      `"${flag.comment}"\n\n` +
      `Independently re-evaluate this specific video using web search. Weigh the reader's point as ` +
      `one perspective to verify — do NOT treat it as authoritative, and do not change the grade or ` +
      `lean unless the evidence warrants it. Apply the same standard you would to any report.`;

    let report;
    try {
      report = await generateBroadcastReport(env.XAI_API_KEY, {
        sourceUrl,
        videoTitle,
        channel,
        notes: note,
      });
    } catch (err: any) {
      return json({ error: err?.message ?? "Re-grade failed" }, 502);
    }

    let updated = fm;
    updated = patchScalar(updated, "letterGrade", str(report.letterGrade));
    updated = patchScalar(updated, "factualityScore", report.factualityScore);
    updated = patchScalar(updated, "leanScore", report.leanScore);
    updated = patchScalar(updated, "politicalLean", str(leanBucket(report.leanScore)));
    if (report.gradeRationale) updated = patchScalar(updated, "gradeRationale", str(report.gradeRationale));
    if (report.leanRationale) updated = patchScalar(updated, "leanRationale", str(report.leanRationale));

    const newContents = file.contents.slice(0, m.index! + 4) + updated + file.contents.slice(m.index! + 4 + fm.length);

    try {
      await commitFile({ ...ref, contents: newContents, message: `re-grade (reader flag): ${postId}` });
    } catch (err: any) {
      return json({ error: err?.message ?? "Commit failed" }, 502);
    }

    const resolution =
      `Re-graded: ${oldGrade} → ${report.letterGrade}, lean ${oldLean ?? "—"} → ${report.leanScore}.`;
    await setFlagStatus(env.AGENTS, id, "updated", resolution);
    return json(
      {
        ok: true,
        oldGrade,
        newGrade: report.letterGrade,
        oldLean,
        newLean: report.leanScore,
        gradeRationale: report.gradeRationale,
        leanRationale: report.leanRationale,
      },
      200
    );
  }

  return json({ error: "action must be review, regrade, or delete" }, 400);
};

/* ---- frontmatter scalar helpers (single-line scalars emitted by yaml.ts) ---- */

function readStr(fm: string, key: string): string | null {
  const m = fm.match(new RegExp(`^${key}: "(.*)"\\s*$`, "m"));
  return m ? unquote(m[1]!) : null;
}
function readNum(fm: string, key: string): number | null {
  const m = fm.match(new RegExp(`^${key}: (-?\\d+)\\s*$`, "m"));
  return m ? Number(m[1]) : null;
}
function unquote(s: string): string {
  return s.replace(/\\(["\\rn])/g, (_, c) => (c === "n" ? "\n" : c === "r" ? "\r" : c));
}
function q(s: string): string {
  return `"${s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")}"`;
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Replace `key:` line within the frontmatter; if absent, insert it after the
// `summary:` line (always present). Operates on the frontmatter block string.
function patchScalar(fm: string, key: string, value: string | number): string {
  const line = `${key}: ${typeof value === "number" ? Math.round(value) : q(value)}`;
  const re = new RegExp(`^${key}:.*$`, "m");
  if (re.test(fm)) return fm.replace(re, line);
  if (/^summary:.*$/m.test(fm)) return fm.replace(/^(summary:.*)$/m, `$1\n${line}`);
  return `${fm}\n${line}`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
