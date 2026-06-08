import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

export const prerender = true;

export async function GET(context: APIContext) {
  const posts = await getCollection("posts", (p) => !p.data.draft);
  const sorted = posts.sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf()
  );

  return rss({
    title: "Clad",
    description:
      "Fact-checked headlines. Each verdict is sourced and hand-reviewed.",
    site: context.site ?? "https://clad.app",
    items: sorted.map((p) => ({
      title: `[${p.data.verdict.toUpperCase()}] ${p.data.headline}`,
      pubDate: p.data.publishedAt,
      description: p.data.summary,
      link: `/posts/${p.id}/`,
      categories: [p.data.section, p.data.verdict],
      customData: `<source url="${p.data.sourceUrl}">${escapeXml(p.data.sourceTitle ?? "")}</source>`,
    })),
    customData: `<language>en-us</language>`,
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
