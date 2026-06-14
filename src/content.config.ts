import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Post schema. Two shapes share one collection:
 *
 *  - "verdict"  — the original single-claim fact-check (paste a headline,
 *                 Grok researches it). One verdict + body.
 *  - "broadcast" — a news broadcast report card generated from a YouTube
 *                 transcript. Mirrors the iOS app's BroadcastReview: an
 *                 overall letter grade, factuality score, summary,
 *                 editorial assessment, notable concerns, and key moments.
 *
 * We use a `type` discriminator plus additive optional fields (NOT a Zod
 * discriminated union) so every getCollection consumer keeps working and the
 * two existing posts stay valid with no edits.
 */
const VERDICTS = [
  "true",
  "mostly-true",
  "mixed",
  "mostly-false",
  "false",
  "unverified",
] as const;

const LETTER_GRADES = [
  "A+", "A", "A-",
  "B+", "B", "B-",
  "C+", "C", "C-",
  "D+", "D", "D-",
  "F",
] as const;

const KEY_MOMENT_VERDICTS = [
  "verified",
  "disputed",
  "missing context",
  "unsupported",
] as const;

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z
    .object({
      type: z.enum(["verdict", "broadcast"]).default("verdict"),
      headline: z.string().min(4),
      kicker: z.string().optional(),
      summary: z.string().min(8),
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
      section: z
        .enum(["Politics", "Economy", "Science", "World", "Tech", "Misc"])
        .default("Misc"),
      draft: z.boolean().default(false),
      featured: z.boolean().default(false),
      correctionOf: z.string().optional(),

      // verdict-post fields
      verdict: z.enum(VERDICTS).optional(),
      rating: z.number().min(0).max(5).optional(),

      // broadcast-report fields (mirror iOS BroadcastReview)
      letterGrade: z.enum(LETTER_GRADES).optional(),
      factualityScore: z.number().int().min(0).max(100).optional(),
      topics: z.array(z.string()).max(4).default([]),
      assessment: z.string().optional(),
      notableConcerns: z.array(z.string()).max(3).default([]),
      keyMoments: z
        .array(
          z.object({
            claim: z.string(),
            verdict: z.enum(KEY_MOMENT_VERDICTS),
            note: z.string(),
          })
        )
        .default([]),
      videoId: z.string().optional(),
      videoTitle: z.string().optional(),
      thumbnail: z.string().url().optional(),
    })
    .superRefine((d, ctx) => {
      if (d.type === "verdict" && !d.verdict) {
        ctx.addIssue({
          code: "custom",
          message: "verdict posts require a verdict",
          path: ["verdict"],
        });
      }
      if (d.type === "broadcast") {
        if (!d.letterGrade)
          ctx.addIssue({ code: "custom", message: "broadcast requires letterGrade", path: ["letterGrade"] });
        if (d.factualityScore == null)
          ctx.addIssue({ code: "custom", message: "broadcast requires factualityScore", path: ["factualityScore"] });
        if (!d.assessment)
          ctx.addIssue({ code: "custom", message: "broadcast requires assessment", path: ["assessment"] });
        if (!d.videoId)
          ctx.addIssue({ code: "custom", message: "broadcast requires videoId", path: ["videoId"] });
      }
    }),
});

export const collections = { posts };
export { VERDICTS, LETTER_GRADES, KEY_MOMENT_VERDICTS };
