import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { commitFile } from "~/lib/github";
import { datedSlug } from "~/lib/slug";
import { emitPost } from "~/lib/yaml";

export const prerender = false;

const SECTIONS = ["Politics", "Economy", "Science", "World", "Tech", "Misc"];
const VERDICTS = ["true", "mostly-true", "mixed", "mostly-false", "false", "unverified"];

export const POST: APIRoute = async ({ request }) => {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.GITHUB_BRANCH) {
    return json({ error: "GitHub publishing is not configured." }, 503);
  }

  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const headline = str(p.headline);
  const summary = str(p.summary);
  const verdict = str(p.verdict);
  const sourceUrl = str(p.sourceUrl);
  const section = str(p.section ?? "Misc");
  const body = str(p.body);
  const kicker = p.kicker ? str(p.kicker) : undefined;
  const sourceTitle = p.sourceTitle ? str(p.sourceTitle) : undefined;
  const draft = Boolean(p.draft);
  const citations = Array.isArray(p.citations)
    ? p.citations
        .map((c: any) => ({ title: str(c?.title ?? ""), url: str(c?.url ?? "") }))
        .filter((c: any) => c.title && c.url)
    : [];

  if (headline.length < 4) return json({ error: "Headline too short" }, 400);
  if (summary.length < 8) return json({ error: "Summary too short" }, 400);
  if (!VERDICTS.includes(verdict)) return json({ error: "Invalid verdict" }, 400);
  if (!SECTIONS.includes(section)) return json({ error: "Invalid section" }, 400);
  if (!sourceUrl) return json({ error: "Source URL required" }, 400);

  const now = new Date();
  const slug = datedSlug(headline, now);
  const path = `src/content/posts/${slug}.md`;

  const fileBody = emitPost(
    {
      headline,
      kicker,
      summary,
      verdict,
      publishedAt: now.toISOString().slice(0, 10),
      sourceUrl,
      sourceTitle,
      section,
      draft,
      citations,
    },
    body
  );

  try {
    const out = await commitFile({
      token: env.GITHUB_TOKEN,
      repo: env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH,
      path,
      contents: fileBody,
      message: `publish: ${headline}`,
    });
    return json({ ok: true, slug, htmlUrl: out.url, postUrl: `/posts/${slug}/` }, 200);
  } catch (err: any) {
    return json({ error: err?.message ?? "Publish failed" }, 502);
  }
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
