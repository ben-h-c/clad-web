import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Fact-check post schema.
 *
 * Every published post is the editor's curated take on a Grok fact-check.
 * The verdict vocabulary mirrors the iOS app so the website reads as a
 * continuation of the same publication.
 */
const VERDICTS = [
  "true",
  "mostly-true",
  "mixed",
  "mostly-false",
  "false",
  "unverified",
] as const;

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    headline: z.string().min(4),
    kicker: z.string().optional(),
    summary: z.string().min(8),
    verdict: z.enum(VERDICTS),
    rating: z.number().min(0).max(5).optional(),
    publishedAt: z.coerce.date(),
    sourceUrl: z.string().url(),
    sourceTitle: z.string().optional(),
    citations: z
      .array(
        z.object({
          title: z.string(),
          url: z.string().url(),
        })
      )
      .default([]),
    section: z.enum(["Politics", "Economy", "Science", "World", "Tech", "Misc"]).default("Misc"),
    draft: z.boolean().default(false),
    // If set, this post is a correction of the post with this id (the slug
    // under `src/content/posts/`, without the `.md` extension). Corrections
    // are issued as a NEW post that references the original — we never
    // silently edit a published verdict.
    correctionOf: z.string().optional(),
  }),
});

export const collections = { posts };
export { VERDICTS };
