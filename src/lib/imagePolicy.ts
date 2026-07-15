/**
 * Site-wide imagery policy (see docs/legal/image-claims.md).
 *
 * Post artwork is either the YouTube CDN still of the post's own embedded
 * video (hotlinked from img.youtube.com — never copied to or served from our
 * servers) or site-owned generated art under /generated/. That invariant is
 * enforced at intake (src/lib/postBuild.ts) and in CI
 * (scripts/checkImageLicense.mjs).
 *
 * SHOW_VIDEO_STILLS is the escalation kill switch: broadcasters' video stills
 * sometimes contain licensed wire-service photos (see the incident log in
 * docs/legal/image-claims.md), and while hotlinking the embedded video's own
 * poster frame is a defensible use, rights agencies' crawlers only see pixels.
 * Flipping this to false removes every video still from the site's tiles in
 * one deploy — site-owned /generated/ art keeps rendering — if claims ever
 * escalate beyond one-off letters. Per-post remediation (the normal case) is
 * an edit to that post's `thumbnail` field instead.
 */
import { isOwnedGeneratedImage } from "./youtube.ts";

export const SHOW_VIDEO_STILLS = true;

/** The thumbnail to render for a tile/card, or null when policy suppresses it. */
export function displayableThumb(url: string | null | undefined): string | null {
  if (!url) return null;
  if (SHOW_VIDEO_STILLS) return url;
  return isOwnedGeneratedImage(url) ? url : null;
}
