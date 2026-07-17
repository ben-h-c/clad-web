import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { env } from "cloudflare:workers";
import { getAccess, hasPremiumFeatures } from "~/lib/access";
import {
  getSessionUser,
  jsonResponse,
  listCommentsForPost,
  getCommentTally,
  getUserComment,
  upsertComment,
  deleteOwnComment,
  sanitizeVote,
  publicName,
  type PostComment,
} from "~/lib/user-data";

export const prerender = false;

const validSlug = (s: string) => !!s && !s.includes("..") && !s.includes("/");

/** Public shape of a reaction (no userId leaked; name is first + last initial). */
function publicComment(c: PostComment, mineId: string | null) {
  return {
    authorName: publicName(c.authorName),
    body: c.body,
    gradeVote: c.gradeVote,
    leanVote: c.leanVote,
    createdAt: c.createdAt,
    mine: c.userId === mineId,
  };
}

// GET /api/comments?slug=<postId> — list reactions + tally. Full-access
// (signed-in) readers; anonymous get 403.
export const GET: APIRoute = async ({ request }) => {
  const access = await getAccess(request.headers);
  if (!access.fullAccess) {
    return jsonResponse(
      { error: "Create a free account to read Reader Reactions.", upgrade: false },
      403
    );
  }
  const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
  if (!validSlug(slug)) return jsonResponse({ error: "Invalid post" }, 400);

  const user = await getSessionUser(request.headers);
  const [comments, tally, mine] = await Promise.all([
    listCommentsForPost(slug),
    getCommentTally(slug),
    user ? getUserComment(user.id, slug) : Promise.resolve(null),
  ]);

  return jsonResponse({
    canComment: hasPremiumFeatures(access),
    tally,
    mine: mine
      ? { body: mine.body, gradeVote: mine.gradeVote, leanVote: mine.leanVote }
      : null,
    comments: comments.map((c) => publicComment(c, user?.id ?? null)),
  });
};

// POST /api/comments — create/update the caller's reaction.
// While billing is paused, any full-access account can post.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const access = await getAccess(request.headers);
  if (!hasPremiumFeatures(access)) {
    const msg = access.fullAccess
      ? "Could not post reaction."
      : "Create a free account to join the discussion.";
    return jsonResponse({ error: msg, upgrade: false }, 403);
  }
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);

  // Rate-limit writes per IP, reusing the existing limiter binding.
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    clientAddress ||
    "unknown";
  if (env.FACTCHECK_LIMITER) {
    const { success } = await env.FACTCHECK_LIMITER.limit({ key: `comment:${ip}` });
    if (!success) {
      return jsonResponse({ error: "Too many submissions. Try again in a minute." }, 429);
    }
  }

  let p: any;
  try {
    p = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
  const slug = String(p?.slug ?? "").trim();
  if (!validSlug(slug)) return jsonResponse({ error: "Invalid post" }, 400);

  const body = String(p?.body ?? "").trim();
  const gradeVote = sanitizeVote(p?.gradeVote);
  const leanVote = sanitizeVote(p?.leanVote);
  if (body.length === 0 && !gradeVote && !leanVote) {
    return jsonResponse({ error: "Add a comment or pick a stance." }, 400);
  }
  if (body.length > 2000) return jsonResponse({ error: "Comment is too long." }, 400);

  // The post must exist and be published.
  const posts = await getCollection("posts", (q) => !q.data.draft);
  if (!posts.some((q) => q.id === slug)) {
    return jsonResponse({ error: "Post not found" }, 404);
  }

  await upsertComment(user.id, user.name || "Reader", slug, body, gradeVote, leanVote);
  return jsonResponse({ ok: true });
};

// DELETE /api/comments?slug=<postId> — remove the caller's own reaction.
export const DELETE: APIRoute = async ({ request }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);
  const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
  if (!validSlug(slug)) return jsonResponse({ error: "Invalid post" }, 400);
  await deleteOwnComment(user.id, slug);
  return jsonResponse({ ok: true });
};
