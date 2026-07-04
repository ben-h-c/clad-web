import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getCollection } from "astro:content";
import { addFlag, type FlagAspect } from "~/lib/agents";
import { getAccess } from "~/lib/access";

export const prerender = false;

const ASPECTS: FlagAspect[] = ["grade", "lean", "both"];

// Any signed-in reader can dispute a post's grade and/or political lean —
// About and How It Works promise flagging as every reader's right, so it is
// never tier-gated. Sign-in + the per-IP rate limit keep it spam-resistant.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const access = await getAccess(request.headers);
  if (!access.signedIn) {
    return json({ error: "Sign in (free) to flag a report.", signIn: true }, 401);
  }

  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    clientAddress ||
    "unknown";

  if (env.FACTCHECK_LIMITER) {
    const { success } = await env.FACTCHECK_LIMITER.limit({ key: `flag:${ip}` });
    if (!success) {
      return json({ error: "Too many submissions. Try again in a minute." }, 429, {
        "Retry-After": "60",
      });
    }
  }

  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const postId = String(p?.postId ?? "").trim();
  const aspect = String(p?.aspect ?? "").trim() as FlagAspect;
  const comment = String(p?.comment ?? "").trim();

  if (!postId || postId.includes("..") || postId.includes("/")) {
    return json({ error: "Invalid post" }, 400);
  }
  if (!ASPECTS.includes(aspect)) {
    return json({ error: "Choose what you're disputing." }, 400);
  }
  if (comment.length < 3) return json({ error: "Please add a comment." }, 400);
  if (comment.length > 2000) return json({ error: "Comment is too long." }, 400);

  // Confirm the post exists (don't store flags for bogus ids) and capture the
  // grade/lean as it stands now.
  const posts = await getCollection("posts", (q) => !q.data.draft);
  const post = posts.find((q) => q.id === postId);
  if (!post) return json({ error: "Post not found" }, 404);

  try {
    await addFlag(env.AGENTS, {
      postId,
      postHeadline: post.data.headline,
      aspect,
      comment,
      currentGrade: post.data.letterGrade ?? null,
      currentLeanScore:
        typeof post.data.leanScore === "number" ? post.data.leanScore : null,
    });
    return json({ ok: true }, 200);
  } catch (err: any) {
    return json({ error: err?.message ?? "Could not submit" }, 502);
  }
};

function json(body: unknown, status: number, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(extra ?? {}) },
  });
}
