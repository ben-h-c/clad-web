/**
 * Memoized published posts (filter !draft, sort by publishedAt desc).
 *
 * Content collection is build-time immutable — safe to cache for the life of
 * a Worker isolate (same pattern as postCount.ts / aggregateTopicsCached).
 * Callers must not mutate the returned array.
 */
import { getCollection, getEntry, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"posts">;

let cachedSorted: readonly Post[] | null = null;
let cachedIds: ReadonlySet<string> | null = null;
let cachedById: ReadonlyMap<string, Post> | null = null;

function materialize(posts: Post[]): void {
  const sorted = posts
    .slice()
    .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
  // Freeze shallowly so callers don't accidentally mutate.
  cachedSorted = Object.freeze(sorted);
  cachedIds = new Set(sorted.map((p) => p.id));
  cachedById = new Map(sorted.map((p) => [p.id, p]));
}

/** Full sorted list of non-draft posts (newest first). */
export async function publishedPostsSorted(): Promise<readonly Post[]> {
  if (cachedSorted) return cachedSorted;
  const posts = await getCollection("posts", (p) => !p.data.draft);
  materialize(posts);
  return cachedSorted!;
}

/** O(1) id membership. */
export async function publishedPostIdSet(): Promise<ReadonlySet<string>> {
  if (cachedIds) return cachedIds;
  await publishedPostsSorted();
  return cachedIds!;
}

/** Map id → post. */
export async function publishedPostsById(): Promise<ReadonlyMap<string, Post>> {
  if (cachedById) return cachedById;
  await publishedPostsSorted();
  return cachedById!;
}

/**
 * Single post by id without scanning the whole collection when possible.
 * Falls back to getEntry (still O(1) in content layer).
 */
export async function getPublishedPost(id: string): Promise<Post | null> {
  if (cachedById) return cachedById.get(id) ?? null;
  try {
    const entry = await getEntry("posts", id);
    if (!entry || entry.data.draft) return null;
    return entry;
  } catch {
    return null;
  }
}
