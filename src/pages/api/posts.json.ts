import { getCollection } from "astro:content";
import { getAccess } from "~/lib/access";

export const prerender = false;

// Public latest-reports contract for the iOS app and Home-Screen widget
// (privacy policy §13); /rss.xml complements it for crawler/third-party
// consumption. Response shape must stay byte-compatible.
// Lightweight feed for the iOS reader (and any future client).
// No body — clients fetch /api/posts/[slug].json for the full article.
// Broadcast premium fields (letterGrade, factualityScore, political lean,
// gradeRationale) are nulled out for restricted readers, mirroring the
// homepage gating in src/lib/access.ts.
export async function GET({ request, url }: { request: Request; url: URL }) {
  const access = await getAccess(request.headers);
  const locked = !access.fullAccess;

  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  const sectionParam = url.searchParams.get("section");
  const verdictParam = url.searchParams.get("verdict");

  const all = (await getCollection("posts", (p) => !p.data.draft)).sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf()
  );

  const filtered = all.filter((p) => {
    if (sectionParam && p.data.section !== sectionParam) return false;
    if (verdictParam && p.data.verdict !== verdictParam) return false;
    return true;
  });

  const page = filtered.slice(offset, offset + limit).map((p) => {
    const d = p.data;
    const sourceHost = (() => {
      try { return new URL(d.sourceUrl).hostname.replace(/^www\./, ""); } catch { return ""; }
    })();
    const isBroadcast = d.type === "broadcast";
    return {
      slug: p.id,
      type: d.type,
      headline: d.headline,
      kicker: d.kicker ?? null,
      summary: d.summary,
      section: d.section,
      publishedAt: d.publishedAt.toISOString(),
      sourceUrl: d.sourceUrl,
      sourceTitle: d.sourceTitle ?? null,
      sourceHost,
      featured: d.featured,
      correctionOf: d.correctionOf ?? null,
      // verdict-post fields
      verdict: !isBroadcast ? (d.verdict ?? null) : null,
      rating: !isBroadcast ? (d.rating ?? null) : null,
      // broadcast-post fields (premium-gated)
      isBroadcast,
      letterGrade: isBroadcast && !locked ? (d.letterGrade ?? null) : null,
      factualityScore: isBroadcast && !locked ? (d.factualityScore ?? null) : null,
      politicalLean: isBroadcast && !locked ? (d.politicalLean ?? null) : null,
      leanScore: isBroadcast && !locked ? (d.leanScore ?? null) : null,
      topics: d.topics ?? [],
      videoId: d.videoId ?? null,
      thumbnail: d.thumbnail ?? null,
    };
  });

  const body = {
    posts: page,
    total: filtered.length,
    limit,
    offset,
    locked,
  };

  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}
