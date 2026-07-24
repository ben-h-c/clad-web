import type { APIRoute } from "astro";
import { publishedPostsSorted } from "~/lib/publishedPosts";
import { getAccess } from "~/lib/access";
import { searchPosts } from "~/lib/search";

export const prerender = false;

// Server-side search: delegates to the shared searchPosts (also used by the
// SSR /search/ page). Grades + lean are omitted for restricted readers.
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);

  const locked = !(await getAccess(request.headers)).fullAccess;
  const posts = await publishedPostsSorted();

  const { total, results } = searchPosts(
    posts,
    {
      q: url.searchParams.get("q") || "",
      outlet: url.searchParams.get("outlet") || "",
      grade: url.searchParams.get("grade") || "",
      bias: url.searchParams.get("bias") || "",
      from: url.searchParams.get("from") || "",
      to: url.searchParams.get("to") || "",
      limit: Number(url.searchParams.get("limit")) || 40,
    },
    locked
  );

  return new Response(JSON.stringify({ total, results }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
};
