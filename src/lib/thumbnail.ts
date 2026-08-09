/**
 * Thumbnail resolution. Every post must have a working image.
 *
 *  - Video posts (pass/weak still QA): YouTube still that actually exists.
 *    `maxresdefault` is sharper but often 404s; fall back to `hqdefault`.
 *  - Still QA fail, editor-chosen illustration, or no usable video still:
 *    generate an editorial illustration with xAI's image model, commit under
 *    public/generated/, return its static path.
 */
import { commitBinaryFile } from "./github.ts";

const XAI_IMAGE_ENDPOINT = "https://api.x.ai/v1/images/generations";
const XAI_IMAGE_MODEL = "grok-imagine-image";

function maxres(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}
function hq(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

async function urlOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" } });
    return r.ok || r.status === 206;
  } catch {
    return false;
  }
}

/** Best YouTube thumbnail that actually resolves (maxres preferred, hq guaranteed). */
export async function bestYoutubeThumb(videoId: string): Promise<string> {
  return (await urlOk(maxres(videoId))) ? maxres(videoId) : hq(videoId);
}

export interface GeneratedImage {
  base64: string;
  mime: string;
}

/** Generate a neutral editorial illustration from a headline via xAI. */
export async function generateThumbnail(
  apiKey: string,
  title: string
): Promise<GeneratedImage | null> {
  const prompt =
    `Editorial illustration for a U.S. political news fact-check headlined: "${title}". ` +
    `Clean restrained editorial illustration style, soft neutral palette, ` +
    `dignified and neutral in tone. No text, no words, no lettering, no logos.`;
  try {
    const r = await fetch(XAI_IMAGE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: XAI_IMAGE_MODEL,
        prompt,
        response_format: "b64_json",
        n: 1,
      }),
    });
    if (!r.ok) return null;
    const d: any = await r.json();
    const it = (d?.data || [])[0];
    if (!it?.b64_json) return null;
    return {
      base64: it.b64_json,
      mime: typeof it.mime_type === "string" ? it.mime_type : "image/jpeg",
    };
  } catch {
    return null;
  }
}

export interface GithubCommitTarget {
  token: string;
  repo: string;
  branch: string;
}

/**
 * Generate site-owned editorial art and commit it under public/generated/.
 * Returns the public path (e.g. `/generated/<slug>.jpg`) or null on failure.
 */
export async function commitGeneratedThumbnail(args: {
  xaiKey: string;
  github: GithubCommitTarget;
  title: string;
  slug: string;
}): Promise<string | null> {
  const img = await generateThumbnail(args.xaiKey, args.title);
  if (!img) return null;
  const ext = img.mime.includes("png") ? "png" : "jpg";
  const path = `public/generated/${args.slug}.${ext}`;
  await commitBinaryFile({
    ...args.github,
    path,
    base64: img.base64,
    message: `thumbnail (generated): ${args.title}`,
  });
  return `/generated/${args.slug}.${ext}`;
}

interface ResolveArgs {
  videoId?: string | null;
  title: string;
  slug: string;
  xaiKey?: string;
  github?: GithubCommitTarget;
  /**
   * Force owned illustration even when a videoId exists (still QA fail path
   * or editor "Use illustration"). Default false → YouTube still for videos.
   */
  preferGenerated?: boolean;
}

/**
 * Resolve a guaranteed-working thumbnail URL for a post. Returns "" only if
 * generation is unavailable/failed and there is no video still.
 */
export async function resolveThumbnail(args: ResolveArgs): Promise<string> {
  if (args.videoId && !args.preferGenerated) {
    return bestYoutubeThumb(args.videoId);
  }

  if (args.xaiKey && args.github) {
    const path = await commitGeneratedThumbnail({
      xaiKey: args.xaiKey,
      github: args.github,
      title: args.title,
      slug: args.slug,
    });
    if (path) return path;
  }

  // Generation failed: fall back to YouTube still if any (always-image).
  if (args.videoId) return bestYoutubeThumb(args.videoId);
  return "";
}
