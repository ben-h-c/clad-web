import { getCollection } from "astro:content";
import { env } from "cloudflare:workers";
import { aggregateTopics } from "~/lib/topics";
import { getBreaking } from "~/lib/agents";
import { buildPoliticianIndex } from "~/lib/politicians";
import { slugify } from "~/lib/slug";

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
    url("/discover/", undefined, "0.6"),
    url("/good-news/", undefined, "0.6"),
    url("/archive/", undefined, "0.5"),
    url("/newsletter/", undefined, "0.5"),
    url("/about/", undefined, "0.4"),
    url("/how-it-works/", undefined, "0.5"),
    url("/corrections/", undefined, "0.5"),
    url("/politicians/", undefined, "0.7"),
    url("/politicians/photo-credits/", undefined, "0.3"),
    url("/bracket/", undefined, "0.75"),
    url("/elections/map/", undefined, "0.8"),
    url("/bracket/votes/", undefined, "0.7"),
    url("/students/", undefined, "0.65"),
    url("/learn/", undefined, "0.65"),
    url("/learn/grades/", undefined, "0.6"),
    url("/learn/lean/", undefined, "0.55"),
    url("/learn/claim-tags/", undefined, "0.55"),
    url("/learn/sources/", undefined, "0.5"),
    url("/learn/spin/", undefined, "0.55"),
    url("/learn/first-vote/", undefined, "0.55"),
    url("/press/", undefined, "0.4"),
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
  // Per-grade archives (see src/pages/grades/[grade].astro).
  for (const g of ["a-plus", "a", "a-minus", "b-plus", "b", "b-minus", "c-plus", "c", "c-minus", "d-plus", "d", "d-minus", "f"]) {
    entries.push(url(`/grades/${g}/`, undefined, "0.5"));
  }
  // Archive months (Eastern calendar, same clock as the masthead).
  {
    const seen = new Set<string>();
    for (const p of posts) {
      const dt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
      }).format(p.data.publishedAt);
      const [y, m] = dt.split("-");
      seen.add(`${y}/${m}`);
    }
    for (const ym of seen) entries.push(url(`/archive/${ym}/`, undefined, "0.4"));
  }
  // Outlet profiles — one per distinct source channel (see /outlets/[outlet]).
  const outlets = new Set<string>();
  for (const p of posts) {
    const s = slugify((p.data.sourceTitle ?? "").trim());
    if (s) outlets.add(s);
  }
  for (const o of outlets) {
    entries.push(url(`/outlets/${o}/`, undefined, "0.5"));
  }
  // Politician report cards — midterm SEO hubs (only people with ≥1 match).
  for (const pol of buildPoliticianIndex(posts)) {
    const last = pol.appearances[0]?.publishedAt.toISOString().slice(0, 10);
    entries.push(url(`/politicians/${pol.slug}/`, last, "0.65"));
  }
  // Active breaking-story clusters. Ephemeral (they 404 once the story ages
  // out), but while live they're the topical hubs crawlers should find first.
  try {
    const breaking = await getBreaking(env.AGENTS);
    for (const it of breaking) {
      if (it.type === "group" && it.slug) entries.push(url(`/breaking/${it.slug}/`, undefined, "0.7"));
    }
  } catch {
    /* KV unavailable (local dev) — sitemap still valid without clusters */
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
