import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { commitFile, deleteFile, getFile } from "~/lib/github";

export const prerender = false;

// Manage published posts: hide (set draft), unhide (clear draft), or delete the
// markdown file. All commit to the repo and trigger a Cloudflare rebuild.
export const POST: APIRoute = async ({ request }) => {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.GITHUB_BRANCH) {
    return json({ error: "GitHub is not configured." }, 503);
  }

  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = String(p?.action ?? "");
  const id = String(p?.id ?? "").trim();
  if (!id || id.includes("..") || id.includes("/")) {
    return json({ error: "Invalid post id" }, 400);
  }
  const path = `src/content/posts/${id}.md`;
  const ref = { token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH, path };

  try {
    if (action === "delete") {
      const out = await deleteFile({ ...ref, message: `unpublish (delete): ${id}` });
      return json({ ok: true, deleted: out.deleted }, 200);
    }

    if (action === "hide" || action === "unhide") {
      const file = await getFile(ref);
      if (!file) return json({ error: "Post not found" }, 404);
      const updated = toggleDraft(file.contents, action === "hide");
      if (updated === file.contents) {
        return json({ ok: true, unchanged: true }, 200);
      }
      await commitFile({ ...ref, contents: updated, message: `${action}: ${id}` });
      return json({ ok: true }, 200);
    }

    return json({ error: "action must be hide, unhide, or delete" }, 400);
  } catch (err: any) {
    return json({ error: err?.message ?? "Operation failed" }, 502);
  }
};

// Edit only the frontmatter `draft:` line, leaving the rest byte-for-byte.
function toggleDraft(md: string, hide: boolean): string {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return md;
  const fmStart = m.index! + 4; // after "---\n"
  const fmEnd = fmStart + m[1]!.length;
  let fm = m[1]!;
  const hasDraft = /^draft:\s*true\s*$/m.test(fm);

  if (hide && !hasDraft) {
    // insert after the `type:` line (or at the top of frontmatter)
    if (/^type:.*$/m.test(fm)) {
      fm = fm.replace(/^(type:.*)$/m, `$1\ndraft: true`);
    } else {
      fm = `draft: true\n${fm}`;
    }
  } else if (!hide && hasDraft) {
    fm = fm.replace(/^draft:\s*true\s*\n?/m, "");
  } else {
    return md; // no change needed
  }
  return md.slice(0, fmStart) + fm + md.slice(fmEnd);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
