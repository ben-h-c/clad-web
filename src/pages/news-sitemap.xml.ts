import { getCollection } from "astro:content";

export const prerender = false;

// Google News sitemap: only articles published in the last 48 hours qualify,
// newest first, capped at Google's 1,000-URL limit for news sitemaps.
// Grades/lean never appear here — headlines and dates only.
const SITE = "https://cladfacts.com";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export async function GET() {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const posts = (
    await getCollection("posts", (p) => !p.data.draft && p.data.publishedAt.valueOf() >= cutoff)
  )
    .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf())
    .slice(0, 1000);

  const entries = posts.map(
    (p) =>
      `  <url><loc>${SITE}/posts/${p.id}/</loc><news:news>` +
      `<news:publication><news:name>CladFacts</news:name><news:language>en</news:language></news:publication>` +
      `<news:publication_date>${p.data.publishedAt.toISOString()}</news:publication_date>` +
      `<news:title>${esc(p.data.headline)}</news:title>` +
      `</news:news></url>`
  );

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ` +
    `xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n` +
    entries.join("\n") +
    `\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Freshness matters for news crawling — keep the edge copy short-lived.
      "Cache-Control": "public, max-age=0, s-maxage=900",
    },
  });
}
