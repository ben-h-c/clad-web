/**
 * YouTube URL helpers. We do NOT fetch transcripts — the editor pastes the
 * transcript by hand. We only parse the URL for the video id, which gives us
 * a stable thumbnail and embed.
 */

/** Pull the 11-character video id out of any common YouTube URL form. */
export function extractVideoId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    // Bare id?
    return /^[\w-]{11}$/.test(url.trim()) ? url.trim() : null;
  }

  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return isId(id) ? id : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const v = u.searchParams.get("v");
    if (v && isId(v)) return v;
    // /embed/ID, /shorts/ID, /live/ID, /v/ID
    const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
    if (m && isId(m[1]!)) return m[1]!;
  }

  return null;
}

export function thumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

/**
 * Image-licensing guard (see docs/legal/image-claims.md): a post's artwork may
 * only be (a) the YouTube CDN still of ITS OWN embedded video, or (b) a
 * site-owned image under /generated/. Anything else — another video's still, a
 * source page's og:image, any third-party photo URL — is rejected at intake so
 * unlicensed press imagery can never enter the corpus.
 */
export function isOwnVideoStill(url: string, videoId: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.hostname !== "img.youtube.com" && u.hostname !== "i.ytimg.com") return false;
    return u.pathname.startsWith(`/vi/${videoId}/`) || u.pathname.startsWith(`/vi_webp/${videoId}/`);
  } catch {
    return false;
  }
}

/** Site-owned generated artwork (committed under public/generated/). Accepts
 *  the relative form and the absolute form on our own domain — the absolute
 *  form is preferred in frontmatter so /api/posts.json hands the iOS app a
 *  loadable URL. */
export function isOwnedGeneratedImage(url: string): boolean {
  return /^(?:https:\/\/(?:www\.)?cladfacts\.com)?\/generated\/[\w.-]+\.(?:png|jpe?g|webp)$/.test(url);
}

export function embedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function isId(s: string | undefined): s is string {
  return !!s && /^[\w-]{11}$/.test(s);
}
