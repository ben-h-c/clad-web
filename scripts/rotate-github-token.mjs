#!/usr/bin/env node
/**
 * Rotate the Worker GITHUB_TOKEN (production + staging).
 *
 * Usage: paste the new fine-grained PAT on stdin, then EOF:
 *   node scripts/rotate-github-token.mjs
 *   pbpaste | node scripts/rotate-github-token.mjs
 *
 * Validates against the GitHub API before writing secrets. Does not print
 * the token. Secret put creates a new Worker version; no astro build needed.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REPO = "ben-h-c/clad-web";

const token = readFileSync(0, "utf8").trim();
if (!token) {
  console.error("No token on stdin.");
  process.exit(1);
}
if (!/^(ghp_|github_pat_)/.test(token)) {
  console.error("Token does not look like a GitHub PAT (expected ghp_ or github_pat_ prefix).");
  process.exit(1);
}

const res = await fetch(`https://api.github.com/repos/${REPO}/contents/README.md`, {
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "clad-web-rotate-github-token",
  },
});
if (res.status === 401) {
  console.error("GitHub rejected this token (401). Generate a new PAT and retry.");
  process.exit(1);
}
if (!res.ok) {
  const body = (await res.text()).replace(/\s+/g, " ").slice(0, 200);
  console.error(`GitHub contents check failed (${res.status}): ${body}`);
  console.error("Need Contents: Read and write on ben-h-c/clad-web.");
  process.exit(1);
}
const expires = res.headers.get("github-authentication-token-expiration");
if (expires) console.log(`GitHub accepted the token. Expires ${expires}.`);
else console.log("GitHub accepted the token.");

function putSecret(envArgs) {
  const r = spawnSync("npx", ["wrangler", "secret", "put", "GITHUB_TOKEN", ...envArgs], {
    cwd: ROOT,
    input: token,
    stdio: ["pipe", "inherit", "inherit"],
    shell: false,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("→ production GITHUB_TOKEN");
putSecret([]);
console.log("→ staging GITHUB_TOKEN");
putSecret(["--env", "staging"]);
console.log("Done. Approve a pending draft on cladfacts.com/admin/queue/ to confirm.");
