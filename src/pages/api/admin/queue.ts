import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { commitFile } from "~/lib/github";
import { datedSlug } from "~/lib/slug";
import { emitPost } from "~/lib/yaml";
import { buildBroadcastFrontmatter } from "~/lib/postBuild";
import { deleteDraft, findDuplicateStory, getDraft, listDrafts, markSeen } from "~/lib/agents";
import { resolveThumbnail } from "~/lib/thumbnail";

export const prerender = false;

export const GET: APIRoute = async () => {
  const drafts = await listDrafts(env.AGENTS);
  return json({ drafts }, 200);
};

export const POST: APIRoute = async ({ request }) => {
  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = String(p?.action ?? "");
  const id = String(p?.draftId ?? "").trim();
  if (!id) return json({ error: "draftId required" }, 400);

  if (action === "reject") {
    await deleteDraft(env.AGENTS, id);
    return json({ ok: true }, 200);
  }

  if (action !== "approve") {
    return json({ error: "action must be 'approve' or 'reject'" }, 400);
  }

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.GITHUB_BRANCH) {
    return json({ error: "GitHub publishing is not configured." }, 503);
  }

  const draft = await getDraft(env.AGENTS, id);
  if (!draft) return json({ error: "Draft not found" }, 404);

  // Backstop: block approving a story this network has already published
  // (something may have gone live since the draft was created). Override with
  // {force:true} if the editor is sure it's a distinct story.
  if (!p?.force) {
    const dup = await findDuplicateStory(env.AGENTS, {
      channel: draft.source.channel ?? "",
      texts: [draft.source.videoTitle ?? "", draft.report.headline],
    });
    if (dup) {
      return json({ error: `Looks like a duplicate — ${dup}. Re-approve to publish anyway.`, duplicate: true }, 409);
    }
  }

  const slug = datedSlug(draft.report.headline, new Date());
  const thumbnail = await resolveThumbnail({
    videoId: draft.videoId,
    title: draft.report.headline,
    slug,
    xaiKey: env.XAI_API_KEY,
    github: { token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH },
  });

  const fm = buildBroadcastFrontmatter(draft.report, {
    sourceUrl: draft.sourceUrl,
    videoId: draft.videoId,
    videoTitle: draft.source.videoTitle,
    sourceTitle: draft.source.channel,
    featured: Boolean(p?.featured),
    draft: false,
    thumbnail: thumbnail || undefined,
  });

  const path = `src/content/posts/${slug}.md`;
  const fileBody = emitPost(fm, "");

  try {
    const out = await commitFile({
      token: env.GITHUB_TOKEN,
      repo: env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH,
      path,
      contents: fileBody,
      message: `publish (agent): ${fm.headline}`,
    });
    await markSeen(env.AGENTS, draft.videoId);
    await deleteDraft(env.AGENTS, id);
    return json({ ok: true, slug, htmlUrl: out.url, postUrl: `/posts/${slug}/` }, 200);
  } catch (err: any) {
    return json({ error: err?.message ?? "Approve/publish failed" }, 502);
  }
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
