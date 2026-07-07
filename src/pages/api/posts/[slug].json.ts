import { getCollection } from "astro:content";
import { env } from "cloudflare:workers";
import { getAccess } from "~/lib/access";
import { getSentiments } from "~/lib/agents";

export const prerender = false;

// Full article payload for a single post. Body is returned as raw markdown
// so clients can render it natively (the iOS reader uses AttributedString).
// Premium-gated fields on broadcasts (grade, factuality, lean) are nulled
// for restricted readers — same policy as /api/posts.json and the web
// /posts/[slug] page.
export async function GET({ request, params }: { request: Request; params: { slug: string } }) {
  const access = await getAccess(request.headers);
  const locked = !access.fullAccess;

  const all = await getCollection("posts", (p) => !p.data.draft);
  const post = all.find((p) => p.id === params.slug);
  if (!post) return new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });

  const d = post.data;
  const isBroadcast = d.type === "broadcast";

  // Social-media sentiment (KV, scanner-scored) — premium-gated like the grade,
  // so the KV read is skipped entirely for restricted readers.
  const sentiment =
    isBroadcast && !locked ? (await getSentiments(env.AGENTS))[post.id] ?? null : null;
  const sourceHost = (() => {
    try { return new URL(d.sourceUrl).hostname.replace(/^www\./, ""); } catch { return ""; }
  })();

  // Surface the correction chain so the client can show "Correction of …" /
  // "Superseded by …" without a second fetch.
  const original = d.correctionOf
    ? all.find((q) => q.id === d.correctionOf)
    : null;
  const successors = all
    .filter((q) => q.data.correctionOf === post.id)
    .sort((a, b) => a.data.publishedAt.valueOf() - b.data.publishedAt.valueOf())
    .map((q) => ({ slug: q.id, headline: q.data.headline, publishedAt: q.data.publishedAt.toISOString() }));

  const body = {
    slug: post.id,
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
    citations: d.citations ?? [],
    bodyMarkdown: post.body ?? "",
    correctionOf: original
      ? { slug: original.id, headline: original.data.headline, publishedAt: original.data.publishedAt.toISOString() }
      : null,
    correctedBy: successors,
    // verdict-post fields
    verdict: !isBroadcast ? (d.verdict ?? null) : null,
    rating: !isBroadcast ? (d.rating ?? null) : null,
    // broadcast-post fields
    isBroadcast,
    letterGrade: isBroadcast && !locked ? (d.letterGrade ?? null) : null,
    factualityScore: isBroadcast && !locked ? (d.factualityScore ?? null) : null,
    politicalLean: isBroadcast && !locked ? (d.politicalLean ?? null) : null,
    leanScore: isBroadcast && !locked ? (d.leanScore ?? null) : null,
    leanRationale: isBroadcast && !locked ? (d.leanRationale ?? null) : null,
    gradeRationale: isBroadcast && !locked ? (d.gradeRationale ?? null) : null,
    socialSentiment: sentiment?.score ?? null,
    sentimentSummary: sentiment?.summary ?? null,
    sentimentVolume: sentiment?.volume ?? null,
    assessment: isBroadcast ? (d.assessment ?? null) : null,
    notableConcerns: isBroadcast ? (d.notableConcerns ?? []) : [],
    keyMoments: isBroadcast ? (d.keyMoments ?? []) : [],
    topics: d.topics ?? [],
    videoId: d.videoId ?? null,
    videoTitle: d.videoTitle ?? null,
    thumbnail: d.thumbnail ?? null,
    locked,
  };

  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}
