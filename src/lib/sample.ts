/**
 * "Report of the Day" — one fully unlocked sample report for restricted
 * readers, rotating deterministically at New York midnight so every
 * anonymous visitor sees the same unlocked post on the same NY day.
 *
 * HTML-only merchandising unlock: the JSON APIs (api/posts.json.ts,
 * api/posts/[slug].json.ts, api/search.ts) and RSS stay fully gated — never
 * thread the sample id into them. Wherever the sample renders unlocked, the
 * article/card subtree MUST carry data-sample-unlocked="true" so the
 * anonymous-leak checker can strip it before asserting.
 */
import { nyDateParts } from "./dateline.ts";

/** Newest N graded broadcasts rotate through the daily sample slot. */
const POOL_SIZE = 14;

export function sampleUnlockedId(
  posts: {
    id: string;
    data: { type?: string; letterGrade?: string | null; publishedAt: Date };
  }[],
  date: Date = new Date()
): string | null {
  const pool = posts
    .filter((p) => p.data.type === "broadcast" && p.data.letterGrade)
    .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf())
    .slice(0, POOL_SIZE);
  if (pool.length === 0) return null;
  const { y, m, d } = nyDateParts(date);
  const key = y * 10000 + m * 100 + d;
  return pool[key % pool.length]!.id;
}
