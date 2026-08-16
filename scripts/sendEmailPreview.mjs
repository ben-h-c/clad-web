/**
 * Build digest + weekly HTML from local posts (for preview / Resend test).
 * Usage: node --experimental-strip-types scripts/sendEmailPreview.mjs [--send to@x]
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { buildDigest } from "../src/lib/digest.ts";
import { buildNewsletter } from "../src/lib/newsletter.ts";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = path.join(root, "src/content/posts");
const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
const posts = [];
for (const file of files) {
  const { data } = matter(await readFile(path.join(dir, file), "utf8"));
  if (data.draft) continue;
  const publishedAt = data.publishedAt ? new Date(data.publishedAt) : null;
  if (!publishedAt || Number.isNaN(publishedAt.valueOf())) continue;
  posts.push({
    id: file.replace(/\.md$/, ""),
    data: {
      ...data,
      publishedAt,
      draft: false,
    },
  });
}
posts.sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());

const digest = buildDigest({
  posts,
  followed: [],
  showGrades: true,
  sinceMs: Date.now() - 8 * 86_400_000,
  name: "Ben",
});
const weekly = buildNewsletter({ posts, showGrades: true });

const outDir = "/tmp/clad-email-preview";
await mkdir(outDir, { recursive: true });
if (digest) await writeFile(path.join(outDir, "digest.html"), digest.html);
if (weekly) await writeFile(path.join(outDir, "weekly.html"), weekly.html);
console.log("wrote", outDir, {
  digest: digest && { subject: digest.subject, count: digest.count },
  weekly: weekly && { subject: weekly.subject, count: weekly.count },
});
