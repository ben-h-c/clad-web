import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";
import { metaDescription } from "~/lib/seo";

export const prerender = false;

// Public feed for crawlers, readers, and third-party consumers. The feed is
// anonymous, and grades unlock with a free account — letterGrade,
// factualityScore, politicalLean, leanScore, and gradeRationale must NEVER
// appear here. Items carry only headline/summary/date/link/categories.
export async function GET(context: APIContext) {
  const posts = (await getCollection("posts", (p) => !p.data.draft))
    .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf())
    .slice(0, 50);

  const feed = await rss({
    title: "CladFacts",
    description: "Fact-checked news broadcasts, graded for accuracy and bias.",
    site: context.site ?? "https://cladfacts.com",
    items: posts.map((p) => ({
      title: p.data.headline,
      link: `/posts/${p.id}/`,
      pubDate: p.data.publishedAt,
      description: metaDescription(p.data.summary, 300),
      categories: [p.data.section, ...(p.data.topics ?? [])],
    })),
    customData: "<language>en-us</language>",
  });

  return new Response(feed.body, {
    headers: {
      "Content-Type": feed.headers.get("Content-Type") ?? "application/xml",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
