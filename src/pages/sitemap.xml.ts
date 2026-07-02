import { getCollection } from "astro:content";
import { aggregateTopics } from "~/lib/topics";

export const prerender = false;

const SITE = "https://cladfacts.com";

function url(loc: string, lastmod?: string, priority?: string): string {
  return (
    `  <url><loc>${SITE}${loc}</loc>` +
    (lastmod ? `<lastmod>${lastmod}</lastmod>` : "") +
    (priority ? `<priority>${priority}</priority>` : "") +
    `</url>`
  );
}

// Live sitemap — reflects current posts/topics (pages are SSR, so there's no
// build-time sitemap). Private/ephemeral routes are excluded.
export async function GET() {
  const posts = await getCollection("posts", (p) => !p.data.draft);
  const topics = aggregateTopics(posts);

  const entries: string[] = [
    url("/", undefined, "1.0"),
    url("/trends/", undefined, "0.7"),
    url("/about/", undefined, "0.4"),
    url("/how-it-works/", undefined, "0.5"),
    url("/corrections/", undefined, "0.5"),
    url("/privacy/", undefined, "0.2"),
    url("/terms/", undefined, "0.2"),
    url("/upgrade/", undefined, "0.4"),
  ];

  for (const p of posts) {
    entries.push(url(`/posts/${p.id}/`, p.data.publishedAt.toISOString().slice(0, 10), "0.8"));
  }
  for (const t of topics) {
    entries.push(url(`/topics/${t.slug}/`, undefined, "0.6"));
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries.join("\n") +
    `\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
