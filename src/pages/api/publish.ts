import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { commitFile } from "~/lib/github";
import { datedSlug } from "~/lib/slug";
import { emitPost, type Frontmatter, type KeyMoment } from "~/lib/yaml";
import { extractVideoId, thumbnailUrl } from "~/lib/youtube";
import { leanBucket, sanitizeShareText } from "~/lib/broadcast";
import { existingVideoIds, findNearDuplicates } from "~/lib/agents";
import { validateCitations } from "~/lib/citations";
import { resolveThumbnail } from "~/lib/thumbnail";
import {
  coerceMediaPresentation,
  resolveMediaPresentation,
  type MediaPresentation,
} from "~/lib/mediaPresentation";
import { sendBreakingPush, apnsConfigured } from "~/lib/push";
import { tagPoliticiansFromText } from "~/lib/politicians";

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

  const slug = datedSlug(headline, new Date());
  const github = { token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH };

  let fm: Frontmatter;
  let body: string;

  if (type === "verdict") {
    const verdict = str(p.verdict);
    const sourceUrl = str(p.sourceUrl);
    body = str(p.body);
    if (!VERDICTS.includes(verdict)) return json({ error: "Invalid verdict" }, 400);
    if (!sourceUrl) return json({ error: "Source URL required" }, 400);
    // Verdict posts have no video — generate an illustration so every post has art.
    const thumbnail = await resolveThumbnail({
      videoId: extractVideoId(sourceUrl),
      title: headline,
      slug,
      xaiKey: env.XAI_API_KEY,
      github,
    });
    const media = await resolvePostMedia({
      p,
      thumbnail,
      headline,
      videoId: extractVideoId(sourceUrl),
      apiKey: env.XAI_API_KEY,
    });
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
      thumbnail: thumbnail || undefined,
      mediaStyle: media.mediaStyle,
      thumbFocusX: media.thumbFocusX,
      thumbFocusY: media.thumbFocusY,
      mediaNote: media.mediaNote,
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
    const shareText = sanitizeShareText(p.shareText);
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

    // Dedup backstop (manual publishes previously had none): block an exact
    // videoId repost or near-duplicate coverage within 48h unless force:true.
    if (!Boolean(p.force)) {
      if ((await existingVideoIds()).has(videoId)) {
        return json(
          { duplicate: true, error: "This video has already been published. Resubmit with force:true to publish anyway." },
          409
        );
      }
      const near = await findNearDuplicates(env.AGENTS, {
        texts: [videoTitle ?? "", headline],
      });
      if (near.length > 0) {
        const top = near[0]!;
        return json(
          {
            duplicate: true,
            error: `Near-duplicate coverage in the last 48h: ${top.headline} (${top.channel ?? "unknown channel"}). Resubmit with force:true to publish anyway.`,
          },
          409
        );
      }
    }

    const thumbnail = await resolveThumbnail({ videoId, title: headline, slug, xaiKey: env.XAI_API_KEY, github });
    const resolvedThumb = thumbnail || thumbnailUrl(videoId);
    const media = await resolvePostMedia({
      p,
      thumbnail: resolvedThumb,
      headline,
      videoId,
      apiKey: env.XAI_API_KEY,
    });

    // Prefer editor-supplied tags; otherwise seed-match the report text so
    // /politicians/ pages stay current without a second model call.
    const politiciansFromBody = Array.isArray(p.politicians)
      ? p.politicians
          .map((x: any) => ({ name: str(x?.name), slug: str(x?.slug) }))
          .filter((x: { name: string; slug: string }) => x.name && x.slug)
          .slice(0, 8)
      : [];
    const politicians =
      politiciansFromBody.length > 0
        ? politiciansFromBody
        : tagPoliticiansFromText({
            headline,
            summary,
            assessment,
            topics,
            keyMomentClaims: keyMoments.map((m) => m.claim),
          });

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
      shareText,
      topics,
      assessment,
      notableConcerns,
      keyMoments,
      videoId,
      videoTitle,
      thumbnail: resolvedThumb,
      mediaStyle: media.mediaStyle,
      thumbFocusX: media.thumbFocusX,
      thumbFocusY: media.thumbFocusY,
      mediaNote: media.mediaNote,
      citations,
      politicians: politicians.length ? politicians : undefined,
    };
    body = str(p.body); // optional extra notes/markdown under the report
  }

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

    // Notify the iOS app. Best-effort: a push failure must never fail a
    // publish. Skip drafts. By the time a notification is delivered and
    // tapped, Cloudflare will have rebuilt and the post URL will be live.
    let push: Awaited<ReturnType<typeof sendBreakingPush>> | null = null;
    if (!draft && (await apnsConfigured())) {
      try {
        push = await sendBreakingPush({
          title: "New report card",
          body: headline,
          slug,
        });
      } catch (e: any) {
        console.error("push fan-out failed:", e?.message ?? e);
      }
    }

    return json({ ok: true, slug, htmlUrl: out.url, postUrl: `/posts/${slug}/`, push }, 200);
  } catch (err: any) {
    return json({ error: err?.message ?? "Publish failed" }, 502);
  }
};

/** Editor override from body, else vision analysis of the still. */
async function resolvePostMedia(args: {
  p: any;
  thumbnail?: string;
  headline: string;
  videoId?: string | null;
  apiKey?: string;
}): Promise<MediaPresentation> {
  const hasOverride =
    args.p?.mediaStyle ||
    args.p?.thumbFocusX != null ||
    args.p?.thumbFocusY != null;
  if (hasOverride) {
    // Editor may force modular/text; otherwise coerce keeps overlay.
    const style = String(args.p.mediaStyle || "overlay").toLowerCase();
    return coerceMediaPresentation(
      {
        mediaStyle: style,
        thumbFocusX: args.p.thumbFocusX,
        thumbFocusY: args.p.thumbFocusY,
        mediaNote:
          typeof args.p.mediaNote === "string" ? args.p.mediaNote : "editor override",
      },
      { allowNonOverlay: style === "modular" || style === "text" }
    );
  }
  return resolveMediaPresentation({
    apiKey: args.apiKey,
    imageUrl: args.thumbnail,
    headline: args.headline,
    videoId: args.videoId,
  });
}

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
