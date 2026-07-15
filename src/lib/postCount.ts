import { getCollection } from "astro:content";

/**
 * Count of published (non-draft) posts, memoized per isolate.
 *
 * The post collection is a build-time Astro content collection — it cannot
 * change at runtime (new posts arrive via a git commit → rebuild → new Worker
 * version with fresh isolates), so the count is immutable for the life of a
 * deploy. The Masthead renders on nearly every page and only needs this number,
 * so caching avoids materializing the whole ~2530-post collection per render.
 * A failed scan leaves the cache unset so a later request can retry.
 */
let cached: number | null = null;

export async function publishedPostCount(): Promise<number> {
  if (cached !== null) return cached;
  try {
    cached = (await getCollection("posts", (p) => !p.data.draft)).length;
    return cached;
  } catch {
    return 0;
  }
}
