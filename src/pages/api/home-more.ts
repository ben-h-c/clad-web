/**
 * JSON pages for the home “For you” infinite feed.
 * Same gating as /api/posts.json — grades/lean null for restricted readers.
 */
import type { APIRoute } from "astro";
import { getAccess } from "~/lib/access";
import { getHomeBundle } from "~/lib/agents";
import { env } from "cloudflare:workers";
import { publishedPostsSorted } from "~/lib/publishedPosts";
import { buildGoodNewsSections } from "~/lib/goodnews";
import {
  HOME_MORE_PAGE_SIZE,
  buildHomeMoreIds,
  defaultHomeMoreSeed,
  pageHomeMoreIds,
} from "~/lib/homeMoreFeed";
import { displayableThumb } from "~/lib/imagePolicy";
import { mediaFromPostData } from "~/lib/mediaPresentation";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const access = await getAccess(request.headers);
  const locked = !access.fullAccess;

  const seed = String(url.searchParams.get("seed") || defaultHomeMoreSeed()).slice(0, 64);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(
    32,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? String(HOME_MORE_PAGE_SIZE), 10) || HOME_MORE_PAGE_SIZE)
  );

  const all = await publishedPostsSorted();
  const byId = new Map(all.map((p) => [p.id, p]));

  const homeBundle = await getHomeBundle(env.AGENTS);
  const curated = homeBundle.frontpage;
  const breakingItems = homeBundle.breaking;
  const discoverStore = homeBundle.discover;
  const goodNewsStore = homeBundle.goodNews;

  const exclude = new Set<string>();
  for (const id of curated) exclude.add(id);
  for (const it of breakingItems) {
    if (it.type === "post") exclude.add(it.id);
    else for (const id of it.ids || []) exclude.add(id);
  }
  for (const s of discoverStore ?? []) {
    for (const id of s.ids || []) exclude.add(id);
  }
  const goodNewsSections =
    (goodNewsStore?.length ?? 0) > 0 ? goodNewsStore! : buildGoodNewsSections(all);
  for (const s of goodNewsSections) {
    for (const id of s.ids || []) exclude.add(id);
  }

  const ids = buildHomeMoreIds(all, exclude, seed);
  const { page, nextOffset, hasMore, total } = pageHomeMoreIds(ids, offset, limit);

  const posts = page
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => {
      const d = p.data;
      const sourceHost = (() => {
        try {
          return new URL(d.sourceUrl).hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      })();
      const media = mediaFromPostData(d);
      const isBroadcast = d.type === "broadcast";
      return {
        slug: p.id,
        headline: d.headline,
        summary: d.summary ?? "",
        publishedAt: d.publishedAt.toISOString(),
        sourceTitle: d.sourceTitle ?? sourceHost,
        sourceHost,
        thumbnail: displayableThumb(d.thumbnail),
        videoId: d.videoId ?? null,
        mediaStyle: media.mediaStyle,
        thumbFocusX: media.thumbFocusX,
        thumbFocusY: media.thumbFocusY,
        letterGrade: isBroadcast && !locked ? (d.letterGrade ?? null) : null,
        leanScore: isBroadcast && !locked ? (typeof d.leanScore === "number" ? d.leanScore : null) : null,
        locked,
      };
    });

  return new Response(
    JSON.stringify({
      posts,
      total,
      limit,
      offset,
      nextOffset,
      hasMore,
      seed,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Locked responses omit grades/lean — safe for short shared cache.
        // Signed-in full-access stays private (varies by tier).
        "Cache-Control": locked
          ? "public, s-maxage=60, stale-while-revalidate=300"
          : "private, no-store",
        Vary: "Cookie",
      },
    }
  );
};
