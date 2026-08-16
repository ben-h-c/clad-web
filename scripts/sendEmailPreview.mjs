/**
 * Build digest + weekly HTML from local posts (for preview / Resend test).
 * Usage: node --experimental-strip-types scripts/sendEmailPreview.mjs [--send to@x]
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { buildDigest } from "../src/lib/digest.ts";
import { buildNewsletter } from "../src/lib/newsletter.ts";
import { welcomeEmailHtml } from "../src/lib/welcomeLetter.ts";

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

const welcome = welcomeEmailHtml("Ben");

function assertEmailSafe(html, label) {
  if (html.includes('BlinkMacSystemFont,"') || /style="[^"]*"[A-Za-z]/.test(html)) {
    throw new Error(`${label}: quoted font name broke a style attribute`);
  }
  if (html.includes("CLAD From Ben") || /From Ben[\s\S]{0,40}Welcome/.test(html)) {
    if (label === "welcome") throw new Error("welcome still has CLAD / From Ben / Welcome masthead");
  }
}

const outDir = "/tmp/clad-email-preview";
await mkdir(outDir, { recursive: true });
if (digest) {
  assertEmailSafe(digest.html, "digest");
  await writeFile(path.join(outDir, "digest.html"), digest.html);
}
if (weekly) {
  assertEmailSafe(weekly.html, "weekly");
  await writeFile(path.join(outDir, "weekly.html"), weekly.html);
}
assertEmailSafe(welcome, "welcome");
if (welcome.includes(">CLAD<") || welcome.includes(">From Ben<") || /<div[^>]*>Welcome<\/div>/.test(welcome)) {
  throw new Error("welcome still renders CLAD / From Ben / Welcome");
}
await writeFile(path.join(outDir, "welcome.html"), welcome);
console.log("wrote", outDir, {
  digest: digest && { subject: digest.subject, count: digest.count },
  weekly: weekly && { subject: weekly.subject, count: weekly.count },
  welcome: true,
});
