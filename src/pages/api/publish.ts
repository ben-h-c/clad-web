import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { commitFile } from "~/lib/github";
import { datedSlug } from "~/lib/slug";
import { emitPost, type Frontmatter, type KeyMoment } from "~/lib/yaml";
import { extractVideoId, thumbnailUrl } from "~/lib/youtube";
import { leanBucket } from "~/lib/broadcast";
import { validateCitations } from "~/lib/citations";

export const prerender = false;

const VERDICTS = ["true", "mostly-true", "mixed", "mostly-false", "false", "unverified"];
const LETTER_GRADES = ["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F"];
const KEY_MOMENT_VERDICTS = ["verified", "disputed", "missing context", "unsupported"];

export const POST: APIRoute = async ({ request }) => {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.GITHUB_BRANCH) {
    return json({ error: "GitHub publishing is not configured." }, 503);
  }

  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const type = p.type === "broadcast" ? "broadcast" : "verdict";

  // Shared fields
  const headline = str(p.headline);
  const summary = str(p.summary);
  // Politics-only publication — every report is political news.
  const section = "Politics";
  const kicker = p.kicker ? str(p.kicker) : undefined;
  const sourceTitle = p.sourceTitle ? str(p.sourceTitle) : undefined;
  const draft = Boolean(p.draft);
  const featured = Boolean(p.featured);
  const correctionOf = p.correctionOf ? str(p.correctionOf) : undefined;
  const rawCitations = Array.isArray(p.citations)
    ? p.citations
        .map((c: any) => ({ title: str(c?.title ?? ""), url: str(c?.url ?? "") }))
        .filter((c: any) => c.title && c.url)
    : [];
  // Drop dead links so "Sources Consulted" never shows 404s.
  const citations = await validateCitations(rawCitations);

  if (headline.length < 4) return json({ error: "Headline too short" }, 400);
  if (summary.length < 8) return json({ error: "Summary too short" }, 400);

  let fm: Frontmatter;
  let body: string;

  if (type === "verdict") {
    const verdict = str(p.verdict);
    const sourceUrl = str(p.sourceUrl);
    body = str(p.body);
    if (!VERDICTS.includes(verdict)) return json({ error: "Invalid verdict" }, 400);
    if (!sourceUrl) return json({ error: "Source URL required" }, 400);
    fm = {
      type: "verdict",
      headline,
      kicker,
      summary,
      publishedAt: today(),
      sourceUrl,
      sourceTitle,
      section,
      draft,
      featured,
      correctionOf,
      verdict,
      citations,
    };
  } else {
    const sourceUrl = str(p.sourceUrl);
    const videoId = extractVideoId(sourceUrl);
    const letterGrade = str(p.letterGrade);
    const factualityScore = Number(p.factualityScore);
    const assessment = str(p.assessment);
    const videoTitle = p.videoTitle ? str(p.videoTitle) : undefined;
    let leanScore = Number(p.leanScore);
    if (!Number.isFinite(leanScore)) leanScore = 0;
    leanScore = Math.max(-100, Math.min(100, Math.round(leanScore)));
    const politicalLean = leanBucket(leanScore);
    const leanRationale = p.leanRationale ? str(p.leanRationale) : undefined;
    const gradeRationale = p.gradeRationale ? str(p.gradeRationale) : undefined;
    const topics = toStringArray(p.topics).slice(0, 4);
    const notableConcerns = toStringArray(p.notableConcerns).slice(0, 3);
    const keyMoments: KeyMoment[] = Array.isArray(p.keyMoments)
      ? p.keyMoments
          .map((m: any) => ({
            claim: str(m?.claim ?? ""),
            verdict: KEY_MOMENT_VERDICTS.includes(m?.verdict) ? str(m.verdict) : "unsupported",
            note: str(m?.note ?? ""),
          }))
          .filter((m: KeyMoment) => m.claim)
      : [];

    if (!videoId) return json({ error: "A valid YouTube URL is required" }, 400);
    if (!LETTER_GRADES.includes(letterGrade)) return json({ error: "Invalid letter grade" }, 400);
    if (!Number.isFinite(factualityScore) || factualityScore < 0 || factualityScore > 100)
      return json({ error: "Factuality score must be 0–100" }, 400);
    if (assessment.length < 8) return json({ error: "Assessment too short" }, 400);

    fm = {
      type: "broadcast",
      headline,
      kicker,
      summary,
      publishedAt: today(),
      sourceUrl,
      sourceTitle,
      section,
      draft,
      featured,
      correctionOf,
      letterGrade,
      factualityScore,
      politicalLean,
      leanScore,
      leanRationale,
      gradeRationale,
      topics,
      assessment,
      notableConcerns,
      keyMoments,
      videoId,
      videoTitle,
      thumbnail: thumbnailUrl(videoId),
      citations,
    };
    body = str(p.body); // optional extra notes/markdown under the report
  }

  const slug = datedSlug(headline, new Date());
  const path = `src/content/posts/${slug}.md`;
  const fileBody = emitPost(fm, body);

  try {
    const out = await commitFile({
      token: env.GITHUB_TOKEN,
      repo: env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH,
      path,
      contents: fileBody,
      message: `publish: ${headline}`,
    });
    return json({ ok: true, slug, htmlUrl: out.url, postUrl: `/posts/${slug}/` }, 200);
  } catch (err: any) {
    return json({ error: err?.message ?? "Publish failed" }, 502);
  }
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((s) => str(s)).filter(Boolean);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
