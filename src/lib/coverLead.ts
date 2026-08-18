import type { CollectionEntry } from "astro:content";
import {
  frameHintFromText,
  isVideoId,
  resolveVideoFrame,
  type VideoFrame,
} from "~/lib/videoFrame";

export type CoverItem =
  | { kind: "post"; post: CollectionEntry<"posts"> }
  | { kind: "group"; slug: string; title: string; topic?: string; members: CollectionEntry<"posts">[] };

export function videoIdOfCoverItem(item: CoverItem): string | null {
  if (item.kind === "post") {
    const id = item.post.data.videoId;
    return isVideoId(id) ? id : null;
  }
  const byNew = [...item.members].sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf()
  );
  const hit = byNew.find((p) => isVideoId(p.data.videoId));
  return hit?.data.videoId ?? null;
}

function hintOfCoverItem(item: CoverItem): VideoFrame | null {
  if (item.kind === "post") {
    const d = item.post.data;
    return frameHintFromText(d.videoTitle || d.headline, d.sourceUrl);
  }
  for (const p of item.members) {
    const h = frameHintFromText(p.data.videoTitle || p.data.headline, p.data.sourceUrl);
    if (h === "phone") return "phone";
  }
  return null;
}

/**
 * First Breaking story whose source is a full-frame landscape video.
 * Phone/Shorts stay in the strip — never the Cover plate.
 */
export async function pickCoverLead(
  items: CoverItem[],
  kv: KVNamespace
): Promise<CoverItem | null> {
  let seen = 0;
  for (const item of items) {
    const videoId = videoIdOfCoverItem(item);
    if (!videoId) continue;
    seen += 1;
    if (seen > 8) break;
    const frame = await resolveVideoFrame(kv, videoId, hintOfCoverItem(item));
    if (frame === "full") return item;
    if (frame === "phone") continue;
    // Unknown: do not risk a Shorts plate.
  }
  return null;
}
