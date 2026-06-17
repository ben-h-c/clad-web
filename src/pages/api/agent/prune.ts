import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { deleteFile } from "~/lib/github";

export const prerender = false;

// Hard safety cap: never delete more than this many posts in a single call,
// regardless of what the caller requests.
const MAX_PER_CALL = 50;

// Delete published posts by id (markdown files in the repo). Used by the
// dead-video pruner to remove articles whose source video is gone/private.
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.GITHUB_BRANCH) {
    return json({ error: "GitHub is not configured." }, 503);
  }

  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const dryRun = !!p?.dryRun;
  const ids: string[] = (Array.isArray(p?.ids) ? p.ids : [])
    .map((v: unknown) => String(v).trim())
    .filter((id: string) => id && !id.includes("..") && !id.includes("/"))
    .slice(0, MAX_PER_CALL);

  if (ids.length === 0) return json({ ok: true, count: 0, deleted: [], note: "no valid ids" }, 200);
  if (dryRun) return json({ ok: true, dryRun: true, wouldDelete: ids, count: ids.length }, 200);

  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const id of ids) {
    try {
      await deleteFile({
        token: env.GITHUB_TOKEN,
        repo: env.GITHUB_REPO,
        branch: env.GITHUB_BRANCH,
        path: `src/content/posts/${id}.md`,
        message: `prune (dead video): ${id}`,
      });
      deleted.push(id);
    } catch (err: any) {
      failed.push({ id, error: String(err?.message ?? err).slice(0, 120) });
    }
  }
  return json({ ok: true, count: deleted.length, deleted, failed }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
