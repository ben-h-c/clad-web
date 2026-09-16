/**
 * Commit a single file to GitHub via the Contents API. Cloudflare Workers
 * Builds is watching the repo, so a successful commit triggers an
 * auto-deploy and the post appears within ~30 seconds.
 *
 * Uses a fine-grained PAT with "Contents: Read and write" on this repo
 * (and nothing else). Stored as the GITHUB_TOKEN secret. Prefer 366-day
 * expiry — a 90-day token dying silently takes down desk publish.
 */

interface CommitArgs {
  token: string;
  repo: string; // "owner/name"
  branch: string;
  path: string; // "src/content/posts/2026-06-07-headline.md"
  contents: string;
  message: string;
}

export async function commitFile(args: CommitArgs): Promise<{ url: string; sha: string }> {
  const url = `https://api.github.com/repos/${args.repo}/contents/${encodeURIComponent(
    args.path
  ).replace(/%2F/g, "/")}`;

  // First check whether the file already exists — if it does, we need the
  // existing sha to update it (otherwise GitHub returns 422).
  let existingSha: string | undefined;
  const head = await fetch(`${url}?ref=${encodeURIComponent(args.branch)}`, {
    headers: gh(args.token),
  });
  if (head.ok) {
    const body: any = await head.json();
    if (body && typeof body.sha === "string") existingSha = body.sha;
  } else if (head.status !== 404) {
    throw await githubHttpError("GET", head);
  }

  const res = await fetch(url, {
    method: "PUT",
    headers: { ...gh(args.token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: args.message,
      branch: args.branch,
      content: b64utf8(args.contents),
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });

  if (!res.ok) {
    throw await githubHttpError("PUT", res);
  }
  const body: any = await res.json();
  return {
    url: body?.content?.html_url ?? "",
    sha: body?.content?.sha ?? "",
  };
}

/**
 * Commit raw bytes (e.g. a generated image) to the repo. `base64` must already
 * be base64 of the file's bytes — the GitHub Contents API stores it verbatim.
 */
export async function commitBinaryFile(args: {
  token: string;
  repo: string;
  branch: string;
  path: string;
  base64: string;
  message: string;
}): Promise<{ url: string; sha: string }> {
  const url = contentsUrl(args.repo, args.path);

  let existingSha: string | undefined;
  const head = await fetch(`${url}?ref=${encodeURIComponent(args.branch)}`, {
    headers: gh(args.token),
  });
  if (head.ok) {
    const body: any = await head.json();
    if (body && typeof body.sha === "string") existingSha = body.sha;
  } else if (head.status !== 404) {
    throw await githubHttpError("GET", head);
  }

  const res = await fetch(url, {
    method: "PUT",
    headers: { ...gh(args.token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: args.message,
      branch: args.branch,
      content: args.base64.replace(/\s/g, ""),
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
  if (!res.ok) throw await githubHttpError("PUT", res);
  const body: any = await res.json();
  return { url: body?.content?.html_url ?? "", sha: body?.content?.sha ?? "" };
}

interface FileRef {
  token: string;
  repo: string;
  branch: string;
  path: string;
}

/** Fetch a file's decoded contents + sha, or null if it doesn't exist. */
export async function getFile(
  args: FileRef
): Promise<{ contents: string; sha: string } | null> {
  const url = contentsUrl(args.repo, args.path);
  const res = await fetch(`${url}?ref=${encodeURIComponent(args.branch)}`, {
    headers: gh(args.token),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await githubHttpError("GET", res);
  const body: any = await res.json();
  const contents = typeof body?.content === "string" ? b64decodeUtf8(body.content) : "";
  return { contents, sha: body?.sha ?? "" };
}

/** Delete a file. Treats an already-missing file as success. */
export async function deleteFile(
  args: FileRef & { message: string }
): Promise<{ deleted: boolean }> {
  const existing = await getFile(args);
  if (!existing) return { deleted: false }; // already gone
  const res = await fetch(contentsUrl(args.repo, args.path), {
    method: "DELETE",
    headers: { ...gh(args.token), "Content-Type": "application/json" },
    body: JSON.stringify({ message: args.message, branch: args.branch, sha: existing.sha }),
  });
  if (!res.ok) throw await githubHttpError("DELETE", res);
  return { deleted: true };
}

/** Live credential check for /admin/health — presence alone is not enough. */
export async function githubCredentialStatus(args: {
  token?: string;
  repo?: string;
}): Promise<{ status: "ok" | "warn" | "bad"; detail: string }> {
  if (!args.token) return { status: "bad", detail: "MISSING" };
  if (!args.repo) return { status: "bad", detail: "GITHUB_REPO missing" };
  const res = await fetch(`https://api.github.com/repos/${args.repo}`, {
    headers: gh(args.token),
  });
  if (res.status === 401) {
    return {
      status: "bad",
      detail: "token rejected (expired or revoked) — desk publish is down until GITHUB_TOKEN is rotated",
    };
  }
  if (!res.ok) {
    const snippet = (await res.text()).replace(/\s+/g, " ").slice(0, 120);
    return { status: "bad", detail: `GitHub ${res.status}: ${snippet}` };
  }
  const expires = res.headers.get("github-authentication-token-expiration");
  if (expires) {
    const when = Date.parse(expires);
    if (!Number.isNaN(when)) {
      const days = Math.round((when - Date.now()) / 86_400_000);
      if (days <= 0) {
        return { status: "bad", detail: `token expired ${expires}` };
      }
      if (days <= 14) {
        return { status: "warn", detail: `ok — token expires in ${days}d (${expires})` };
      }
      return { status: "ok", detail: `ok — token expires ${expires}` };
    }
    return { status: "ok", detail: `ok — token expires ${expires}` };
  }
  return { status: "ok", detail: "ok" };
}

async function githubHttpError(method: string, res: Response): Promise<Error> {
  const body = (await res.text()).replace(/\s+/g, " ").slice(0, 180);
  if (res.status === 401) {
    return new Error(
      "GitHub rejected the Worker token (expired or revoked). Update the GITHUB_TOKEN secret."
    );
  }
  if (res.status === 403) {
    if (/rate limit/i.test(body)) {
      return new Error("GitHub rate limit hit. Wait a minute and retry.");
    }
    return new Error(
      "GitHub denied the request (missing Contents write, or abuse detection)."
    );
  }
  if (res.status === 409) {
    return new Error("GitHub commit conflict. Retry the publish.");
  }
  return new Error(`GitHub ${method} ${res.status}: ${body}`);
}

function contentsUrl(repo: string, path: string): string {
  return `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path).replace(
    /%2F/g,
    "/"
  )}`;
}

function gh(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "clad-web",
  };
}

function b64utf8(s: string): string {
  // Cloudflare Workers' btoa only handles latin1; encode UTF-8 first.
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function b64decodeUtf8(s: string): string {
  // GitHub returns base64 with newlines; strip them, then decode to UTF-8.
  const bin = atob(s.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
