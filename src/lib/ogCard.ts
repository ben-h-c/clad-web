/**
 * Shared helpers for the OG share-card routes.
 *
 * CACHE VERSIONING — the one pattern for every card route:
 * Cards are cached twice outside the Worker (zone CDN keyed on the URL, and
 * social scrapers' own unfurl caches keyed on the og:image URL) plus once
 * inside it (caches.default). A redesign must bust all three or users keep
 * sharing yesterday's card, which is exactly what happened on 2026-07-16
 * (quiz/week served the pre-redesign card ~6h after the commit).
 *
 *  - Worker cache: ogCacheKey() folds the version into a synthetic
 *    (never-served) path segment, so bumping the constant invalidates on
 *    deploy. The query string is deliberately dropped — ?anything must not
 *    fan out satori renders (anti-DoS property the routes rely on).
 *  - CDN + scrapers: the EMITTING page appends ?v=<same constant> to the
 *    og:image URL, giving crawlers a brand-new URL.
 *
 * RULE: any card redesign bumps that card's constant here, in the same
 * commit. Route and page import the same constant so they cannot drift.
 *
 * PHOTOS ON SHARE CARDS — only bake pixels from:
 *  - YouTube stills / post thumbs via displayableThumb (policy gate)
 *  - Wikimedia Commons politician portraits
 *  - Site-owned assets under /tour/ and /generated/ (served from ASSETS)
 * Never hotlink arbitrary third-party og:images.
 */
import { displayableThumb } from "./imagePolicy.ts";
import { isCommonsMediaUrl } from "./politicianPhotos.ts";

export const OG_VERSIONS = {
  post: "6", // v6: lean geometry bar + word-boundary clipping
  story: "4", // v4: word-boundary clipping
  quiz: "3", // v3: post still beside the claim
  week: "2", // v2: collage of the week's report stills
  learn: "3", // v3: owned product screenshot
  politician: "4", // v4: claim-record grade + ideology lean on share card
  bracket: "3", // v3: candidate portrait strip
  bracketVotes: "2", // v2: candidate portrait strip
  students: "2", // v2: owned product screenshot
  campaign: "2", // v2: owned product screenshot
  ballot: "2", // v2: candidate portrait strip on shared ballots
} as const;

export function ogCacheKey(url: URL, route: string, version: string): Request {
  return new Request(url.origin + "/__og-" + route + "-v" + version + url.pathname);
}

/**
 * Word-boundary clip for card text. Raw slice() amputates mid-word
 * ("…independent recommendat…"); this backs up to the last space when one
 * exists in the final 24 chars, trims trailing punctuation, and appends an
 * ellipsis.
 */
export function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > n - 24 ? cut.slice(0, sp) : cut).trimEnd().replace(/[,;:—-]$/, "") + "…";
}

/** Preferred post still URL for OG cards (thumbnail or YouTube hqdefault). */
export function postStillUrl(p: {
  data: { thumbnail?: string | null; videoId?: string | null };
}): string | null {
  const t = displayableThumb(p.data.thumbnail ?? null);
  if (t) return t;
  if (p.data.videoId && displayableThumb(`https://img.youtube.com/vi/${p.data.videoId}/hqdefault.jpg`)) {
    return `https://img.youtube.com/vi/${p.data.videoId}/hqdefault.jpg`;
  }
  return null;
}

function arrayBufferToDataUri(buf: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function sniffMime(bytes: Uint8Array, headerType: string | null): string | null {
  let mime = (headerType || "").split(";")[0]?.trim() || "";
  if (!mime.startsWith("image/")) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = "image/png";
    else if (bytes[0] === 0xff && bytes[1] === 0xd8) mime = "image/jpeg";
    else if (bytes[0] === 0x52 && bytes[1] === 0x49) mime = "image/webp";
    else return null;
  }
  if (mime === "image/svg+xml" || mime === "image/gif") return null;
  return mime;
}

/**
 * Fetch an image and return a data URI for satori, or null.
 * - relative paths: resolved against origin (site-owned /tour, /generated)
 * - YouTube / other thumbs: only if displayableThumb allows
 * - Commons portraits: only if isCommonsMediaUrl
 */
export async function loadImageDataUri(
  rawUrl: string | null | undefined,
  origin: string,
  opts?: { kind?: "thumb" | "commons" | "owned" | "any-allowed" }
): Promise<string | null> {
  if (!rawUrl) return null;
  const kind = opts?.kind ?? "any-allowed";
  let url = rawUrl.trim();
  if (!url) return null;

  if (url.startsWith("/")) {
    // Site-owned static asset (tour shots, generated art)
    url = new URL(url, origin).href;
  } else if (kind === "commons" || (kind === "any-allowed" && isCommonsMediaUrl(url))) {
    if (!isCommonsMediaUrl(url)) return null;
  } else if (kind === "thumb" || kind === "any-allowed") {
    const allowed = displayableThumb(url);
    if (!allowed) return null;
    url = allowed.startsWith("/") ? new URL(allowed, origin).href : allowed;
  } else if (kind === "owned") {
    // Only same-origin /generated or /tour after resolution
    if (!url.includes("/generated/") && !url.includes("/tour/")) return null;
  } else {
    return null;
  }

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "CladFactsOG/1.0 (+https://cladfacts.com)",
        Accept: "image/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 400 || buf.byteLength > 2_500_000) return null;
    const mime = sniffMime(new Uint8Array(buf), r.headers.get("content-type"));
    if (!mime) return null;
    return arrayBufferToDataUri(buf, mime);
  } catch {
    return null;
  }
}

/** Load a first-party asset via the Workers ASSETS binding (preferred for /tour). */
export async function loadAssetDataUri(
  assets: { fetch: (req: Request) => Promise<Response> },
  path: string,
  origin: string
): Promise<string | null> {
  const p = path.startsWith("/") ? path : `/${path}`;
  try {
    const r = await assets.fetch(new Request(new URL(p, origin)));
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 400 || buf.byteLength > 2_500_000) return null;
    const mime = sniffMime(new Uint8Array(buf), r.headers.get("content-type"));
    if (!mime) return null;
    return arrayBufferToDataUri(buf, mime);
  } catch {
    return null;
  }
}

/** Horizontal strip of portrait data-URIs for election share cards. */
export function portraitStripMarkup(
  uris: string[],
  opts?: { size?: number; gap?: number }
): string {
  if (!uris.length) return "";
  const size = opts?.size ?? 112;
  const gap = opts?.gap ?? 10;
  const INK = "#1A140D";
  const faces = uris
    .slice(0, 5)
    .map(
      (u) =>
        `<div style="display:flex;width:${size}px;height:${size}px;border:3px solid ${INK};overflow:hidden;background:${INK}">
          <img src="${u}" width="${size}" height="${size}" style="object-fit:cover;object-position:center top;width:${size}px;height:${size}px;" />
        </div>`
    )
    .join("");
  return `<div style="display:flex;flex-direction:row;gap:${gap}px;align-items:center">${faces}</div>`;
}
