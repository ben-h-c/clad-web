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
  DEFAULT_MEDIA,
  needsOwnedIllustration,
  resolveMediaPresentation,
  type MediaPresentation,
} from "~/lib/mediaPresentation";
import { xaiLimits } from "~/lib/xaiEconomy";
import { getXaiApiKey } from "~/lib/spendGuard";
import { maybeSendReportPush, apnsConfigured } from "~/lib/push";
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
    const videoId = extractVideoId(sourceUrl);
    const { thumbnail, media } = await resolvePublishArt({
      p,
      videoId,
      headline,
      slug,
      github,
      apiKey: getXaiApiKey(request, p),
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
      stillQuality: media.stillQuality,
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

    const { thumbnail: resolvedThumb, media } = await resolvePublishArt({
      p,
      videoId,
      headline,
      slug,
      github,
      apiKey: getXaiApiKey(request, p),
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
      thumbnail: resolvedThumb || thumbnailUrl(videoId),
      mediaStyle: media.mediaStyle,
      thumbFocusX: media.thumbFocusX,
      thumbFocusY: media.thumbFocusY,
      stillQuality: media.stillQuality,
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

    // iOS push — quality-gated (see pushPolicy.ts). Most publishes skip the
    // lock screen and land in the evening digest queue instead. Never fail publish.
    let push: Awaited<ReturnType<typeof maybeSendReportPush>> | null = null;
    if (!draft && (await apnsConfigured())) {
      try {
        const letterGrade =
          type === "broadcast" && typeof (fm as any).letterGrade === "string"
            ? (fm as any).letterGrade
            : null;
        const factualityScore =
          type === "broadcast" && typeof (fm as any).factualityScore === "number"
            ? (fm as any).factualityScore
            : null;
        const topics = Array.isArray((fm as any).topics) ? (fm as any).topics : [];
        push = await maybeSendReportPush({
          slug,
          headline,
          letterGrade,
          factualityScore,
          featured,
          topics,
          sourceTitle,
          summary,
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

/**
 * Resolve thumbnail + media presentation for publish.
 * Always-image: still QA fail or preferIllustration → owned `/generated/` art.
 */
async function resolvePublishArt(args: {
  p: any;
  videoId?: string | null;
  headline: string;
  slug: string;
  github: { token: string; repo: string; branch: string };
  apiKey?: string;
}): Promise<{ thumbnail: string; media: MediaPresentation }> {
  const ytThumb = await resolveThumbnail({
    videoId: args.videoId,
    title: args.headline,
    slug: args.slug,
  });
  let media = await resolvePostMedia({
    p: args.p,
    thumbnail: ytThumb || undefined,
    headline: args.headline,
    videoId: args.videoId,
    apiKey: args.apiKey,
  });

  const forceStill = Boolean(args.p?.forceStill);
  const preferIllustration = Boolean(args.p?.preferIllustration);
  const wantIllustration = needsOwnedIllustration(media, {
    forceStill,
    preferIllustration,
  });

  let thumbnail = ytThumb;
  if (wantIllustration && args.apiKey) {
    const generated = await resolveThumbnail({
      videoId: args.videoId,
      title: args.headline,
      slug: args.slug,
      xaiKey: args.apiKey,
      github: args.github,
      preferGenerated: true,
    });
    if (generated && generated.startsWith("/generated/")) {
      thumbnail = generated;
      media = {
        ...media,
        mediaStyle: "overlay",
        mediaNote: (
          media.stillQuality === "fail"
            ? `YT still fail → owned illustration${media.mediaNote ? `: ${media.mediaNote}` : ""}`
            : typeof args.p?.mediaNote === "string" && args.p.mediaNote
              ? args.p.mediaNote
              : "editor chose illustration"
        ).slice(0, 200),
      };
    } else {
      thumbnail = ytThumb || generated;
      media = {
        ...media,
        mediaStyle: "overlay",
        mediaNote: (
          media.mediaNote
            ? `illustration failed — showing still: ${media.mediaNote}`
            : "illustration failed — showing YT still"
        ).slice(0, 200),
      };
    }
  } else if (!thumbnail && args.videoId) {
    thumbnail = thumbnailUrl(args.videoId);
  }

  return { thumbnail, media };
}

/** Editor override from body, else vision analysis of the still. */
async function resolvePostMedia(args: {
  p: any;
  thumbnail?: string;
  headline: string;
  videoId?: string | null;
  apiKey?: string;
}): Promise<MediaPresentation> {
  const styleRaw =
    typeof args.p?.mediaStyle === "string" ? args.p.mediaStyle.trim().toLowerCase() : "";
  const forceStill = Boolean(args.p?.forceStill);
  const preferIllustration =
    Boolean(args.p?.preferIllustration) || styleRaw === "text";

  // Editor chose illustration (or legacy hide) — mark for owned art path.
  if (preferIllustration && !forceStill) {
    return {
      ...DEFAULT_MEDIA,
      stillQuality:
        typeof args.p?.stillQuality === "string" ? args.p.stillQuality : "fail",
      mediaNote:
        typeof args.p?.mediaNote === "string" && args.p.mediaNote
          ? args.p.mediaNote
          : "editor chose illustration",
    };
  }

  const hasFocusOverride =
    args.p?.thumbFocusX != null || args.p?.thumbFocusY != null;
  // Explicit focus (or force-show) — keep editor framing; optional quality.
  if (hasFocusOverride || forceStill || styleRaw === "overlay" || styleRaw === "modular") {
    const style = styleRaw === "modular" || styleRaw === "overlay" ? styleRaw : "overlay";
    return coerceMediaPresentation(
      {
        mediaStyle: style === "modular" ? "overlay" : style,
        thumbFocusX: args.p.thumbFocusX,
        thumbFocusY: args.p.thumbFocusY,
        stillQuality:
          typeof args.p?.stillQuality === "string" ? args.p.stillQuality : undefined,
        mediaNote:
          typeof args.p.mediaNote === "string" ? args.p.mediaNote : "editor override",
      },
      { allowNonOverlay: false }
    );
  }
  // Economy mode / staging without spend opt-in skips vision.
  if (!args.apiKey || !xaiLimits(env.XAI_ECONOMY).enableVisionOnPublish) {
    return { ...DEFAULT_MEDIA, mediaNote: "default 16:9 framing (no vision)" };
  }
  return resolveMediaPresentation({
    apiKey: args.apiKey,
    imageUrl: args.thumbnail,
    headline: args.headline,
    videoId: args.videoId,
    forceStill,
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
