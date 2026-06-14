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

export function embedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function isId(s: string | undefined): s is string {
  return !!s && /^[\w-]{11}$/.test(s);
}
