/**
 * Site-wide imagery policy (see docs/legal/image-claims.md).
 *
 * Post artwork is either the YouTube CDN still of the post's own embedded
 * video or site-owned generated art under /generated/ — enforced at intake
 * (src/lib/postBuild.ts) and in CI (scripts/checkImageLicense.mjs). Two
 * different surfaces treat that still differently, and the difference is
 * legally load-bearing: TILES hotlink it (`<img src="img.youtube.com/…">`, no
 * copy on our servers), while the OG/story SHARE CARDS
 * (src/pages/og/[slug].png.ts, og/story/[slug].png.ts) fetch it server-side
 * and BAKE it into a PNG we serve from cladfacts.com — a hosted reproduction.
 * See docs/legal/image-claims.md "Two different surfaces" before relying on a
 * "no copy" claim anywhere.
 *
 * SHOW_VIDEO_STILLS is the escalation kill switch: broadcasters' video stills
 * sometimes contain licensed wire-service photos (see the incident log in
 * docs/legal/image-claims.md), and rights agencies' crawlers only see pixels,
 * not provenance. Flipping this to false makes displayableThumb() drop every
 * video still in one deploy — from tiles AND from the baked share cards
 * (only owned /generated/ art is composed into a served PNG after that);
 * site-owned art keeps rendering everywhere. Per-post remediation (the normal
 * case) is an edit to that post's `thumbnail` field instead.
 */
import { isOwnedGeneratedImage } from "./youtube.ts";

export const SHOW_VIDEO_STILLS = true;

/** The thumbnail to render for a tile/card, or null when policy suppresses it. */
export function displayableThumb(url: string | null | undefined): string | null {
  if (!url) return null;
  if (SHOW_VIDEO_STILLS) return url;
  return isOwnedGeneratedImage(url) ? url : null;
}
