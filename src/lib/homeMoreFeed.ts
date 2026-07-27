/**
 * Bottom-of-home “For you” feed: day-seeded shuffle of posts the reader has
 * not already seen higher on the page (front page, breaking, discover, etc.).
 * Served 25 at a time with Load more / infinite-scroll continuation.
 */
import type { CollectionEntry } from "astro:content";
import { todayIsoNy } from "./calendarEvents.ts";

export const HOME_MORE_PAGE_SIZE = 25;

/** Deterministic 0..1 PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function defaultHomeMoreSeed(now = new Date()): string {
  return `home-more-${todayIsoNy(now)}`;
}

/** Fisher–Yates shuffle with a stable seed (same day → same order). */
export function shuffleSeeded<T>(items: T[], seed: string): T[] {
  const out = [...items];
  const rng = mulberry32(hashSeed(seed || "home-more"));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Build ordered post ids for the more-feed, excluding stories already featured
 * higher on the home page.
 */
export function buildHomeMoreIds(
  posts: CollectionEntry<"posts">[],
  excludeIds: Iterable<string>,
  seed?: string
): string[] {
  const ban = new Set(
    [...excludeIds].map((id) => String(id || "").trim()).filter(Boolean)
  );
  const pool = posts.filter((p) => !p.data.draft && !ban.has(p.id));
  return shuffleSeeded(pool, seed ?? defaultHomeMoreSeed()).map((p) => p.id);
}

export function pageHomeMoreIds(
  ids: string[],
  offset: number,
  limit = HOME_MORE_PAGE_SIZE
): { page: string[]; nextOffset: number; hasMore: boolean; total: number } {
  const start = Math.max(0, offset | 0);
  const size = Math.max(1, Math.min(50, limit | 0));
  const page = ids.slice(start, start + size);
  const nextOffset = start + page.length;
  return {
    page,
    nextOffset,
    hasMore: nextOffset < ids.length,
    total: ids.length,
  };
}
