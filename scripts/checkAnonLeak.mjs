/**
 * Anonymous-leak + empty-body guard. Fetches key routes with NO cookies and
 * asserts (a) pages render a real body (regression guard against blank SSR
 * pages) and (b) none of the Premium-gated markup — letter grade, factuality
 * score, political lean, rationales — reaches anonymous HTML or JSON.
 *
 * Subtrees marked data-sample-unlocked are stripped before asserting: that
 * attribute is the one sanctioned "free sample" carve-out (at most one
 * post/card per day), so it is whitelisted here.
 *
 * Run:  node scripts/checkAnonLeak.mjs
 *   BASE_URL=https://cladfacts.com node scripts/checkAnonLeak.mjs
 *
 * Without BASE_URL it spawns `npx wrangler dev --port 8788` against the
 * already-built dist/ (run `npm run build` first) and tears it down after.
 * No Cloudflare auth needed — local-mode miniflare with empty D1/KV.
 */
import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POSTS_DIR = path.join(ROOT, "src", "content", "posts");
const PORT = 8788;

// Nothing here may hang a CI runner: every fetch carries a timeout, and a
// global watchdog hard-exits if the whole run exceeds its budget.
const FETCH_TIMEOUT_MS = 90_000;
const WATCHDOG_MS = 12 * 60_000;
const watchdog = setTimeout(() => {
  console.error(`watchdog: run exceeded ${WATCHDOG_MS / 60_000} minutes — aborting`);
  process.exit(2);
}, WATCHDOG_MS);
watchdog.unref?.();

function timedFetch(url, opts = {}, ms = FETCH_TIMEOUT_MS) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
}

// ---------------------------------------------------------------------------
// Find the latest published broadcast post (its grade data drives the
// post-specific assertions).
// ---------------------------------------------------------------------------
const files = (await readdir(POSTS_DIR)).filter((f) => f.endsWith(".md"));
const broadcasts = [];
for (const f of files) {
  const { data } = matter(await readFile(path.join(POSTS_DIR, f), "utf8"));
  if (data.draft || data.type !== "broadcast") continue;
  broadcasts.push({ at: new Date(data.publishedAt).getTime(), slug: f.replace(/\.md$/, ""), fm: data });
}
broadcasts.sort((a, b) => b.at - a.at);
// Two posts, not one: the daily sample carve-out can land on the newest post,
// whose marked subtree gets stripped before asserting — a second post
// guarantees the post-page leak assertions always run against gated markup.
const testPosts = broadcasts.slice(0, 2);
if (testPosts.length === 0) {
  console.error("no published broadcast post found under src/content/posts/");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Server: use BASE_URL if given, otherwise spawn wrangler dev.
// ---------------------------------------------------------------------------
let base = process.env.BASE_URL?.replace(/\/$/, "");
let server = null;

async function startServer() {
  // detached → own process group, so teardown can kill wrangler AND the
  // workerd children npx spawns (an orphaned child holds CI steps open).
  server = spawn("npx", ["wrangler", "dev", "--port", String(PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let lastOutput = "";
  server.stdout.on("data", (d) => { lastOutput = String(d).slice(-500); });
  server.stderr.on("data", (d) => { lastOutput = String(d).slice(-500); });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`wrangler dev exited early (code ${server.exitCode}); last output: ${lastOutput}`);
    }
    try {
      const res = await timedFetch(`http://127.0.0.1:${PORT}/`, {}, 15_000);
      if (res.status === 200) return `http://127.0.0.1:${PORT}`;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`wrangler dev did not become ready within 180s; last output: ${lastOutput}`);
}

function stopServer() {
  if (!server || server.exitCode !== null) return;
  try {
    process.kill(-server.pid, "SIGTERM"); // whole process group
  } catch {
    server.kill("SIGTERM");
  }
}
process.on("exit", stopServer);
process.on("SIGINT", () => process.exit(130));

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/** Remove every [data-sample-unlocked] subtree (the sanctioned free-sample
 *  carve-out) before leak assertions. Depth-counted on the opening tag name. */
function stripSampleUnlocked(html) {
  let out = html;
  for (;;) {
    const open = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\bdata-sample-unlocked\b[^>]*>/.exec(out);
    if (!open) return out;
    const tag = open[1];
    const scan = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, "g");
    scan.lastIndex = open.index + open[0].length;
    let depth = 1;
    let end = out.length;
    let m;
    while ((m = scan.exec(out))) {
      if (m[0].startsWith("</")) depth -= 1;
      else if (!m[0].endsWith("/>")) depth += 1;
      if (depth === 0) {
        end = m.index + m[0].length;
        break;
      }
    }
    out = out.slice(0, open.index) + out.slice(end);
  }
}

/** Visible-text byte length, tags and script/style bodies stripped. */
function textBytes(html) {
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ");
  return Buffer.byteLength(text.replace(/\s+/g, " ").trim(), "utf8");
}

const LEAK_PATTERNS = [
  [/class="[^"]*letter-grade/, "letter-grade markup (LetterGrade.astro)"],
  [/\b\d+% (Left|Right)-leaning/, "lean percentage text (PoliticalLean.astro)"],
  [/aria-label="Political lean"|Centered</, "political-lean chip markup (PoliticalLean.astro)"],
  [/\d+<[^>]*>\/100|Factuality score/, "factuality-score markup (FactualityBar.astro)"],
];

const failures = [];
function fail(route, msg) {
  failures.push(`${route}: ${msg}`);
}

async function checkHtml(route, { minBytes = 2048, post = null } = {}) {
  const started = Date.now();
  let res;
  try {
    res = await timedFetch(base + route, { redirect: "manual" });
  } catch (err) {
    fail(route, `fetch failed/timed out after ${Date.now() - started}ms: ${err?.message ?? err}`);
    return;
  }
  if (res.status !== 200) {
    fail(route, `expected 200, got ${res.status}`);
    return;
  }
  const raw = await res.text();
  const html = stripSampleUnlocked(raw);

  // Size on the RAW response (the sample subtree is real content); leak
  // patterns on the sample-stripped HTML.
  const bytes = textBytes(raw);
  if (bytes <= minBytes) {
    fail(route, `body too small (${bytes} bytes of text, need > ${minBytes}) — blank-page regression?`);
  }
  for (const [re, what] of LEAK_PATTERNS) {
    if (re.test(html)) fail(route, `anonymous leak: ${what} matched ${re}`);
  }
  if (post?.gradeRationale) {
    const snippet = String(post.gradeRationale).slice(0, 60);
    const escaped = snippet
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
    if (html.includes(snippet) || html.includes(escaped)) {
      fail(route, "anonymous leak: gradeRationale text present in HTML");
    }
  }
  if (failures.every((f) => !f.startsWith(`${route}:`))) {
    console.log(`PASS ${route} (${Date.now() - started}ms)`);
  }
}

async function checkPostJson(route) {
  const started = Date.now();
  let res;
  try {
    res = await timedFetch(base + route);
  } catch (err) {
    fail(route, `fetch failed/timed out after ${Date.now() - started}ms: ${err?.message ?? err}`);
    return;
  }
  if (res.status !== 200) {
    fail(route, `expected 200, got ${res.status}`);
    return;
  }
  let body;
  try {
    body = await res.json();
  } catch {
    fail(route, "response is not valid JSON");
    return;
  }
  for (const field of ["letterGrade", "factualityScore", "leanScore", "gradeRationale"]) {
    if (body[field] !== null) fail(route, `anonymous leak: ${field} is ${JSON.stringify(body[field])}, expected null`);
  }
  if (body.locked !== true) fail(route, `expected locked:true, got ${JSON.stringify(body.locked)}`);
  if (failures.every((f) => !f.startsWith(`${route}:`))) {
    console.log(`PASS ${route} (${Date.now() - started}ms)`);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
try {
  if (!base) base = await startServer();
  console.log(`checking anonymous responses against ${base}`);
  console.log(`test posts: ${testPosts.map((p) => p.slug).join(", ")}`);

  const home = await timedFetch(base + "/");
  const homeHtml = home.status === 200 ? await home.text() : "";

  await checkHtml("/");
  for (const post of testPosts) {
    await checkHtml(`/posts/${post.slug}/`, { post: post.fm });
    // Trailing slash required: with trailingSlash:"always" the dynamic
    // .json endpoint only matches the slash form (middleware exempts /api/*
    // from slash redirects to keep the iOS contract byte-stable).
    await checkPostJson(`/api/posts/${post.slug}.json/`);
  }
  // /discover/ and /good-news/ render a small placeholder when the local KV
  // has no curated collections — low floor tolerates empty-KV dev/CI runs.
  await checkHtml("/discover/", { minBytes: 800 });
  await checkHtml("/good-news/", { minBytes: 800 });
  await checkHtml("/trends/");
  await checkHtml("/rss.xml", { minBytes: 1024 });
  await checkHtml("/search/?q=test", { minBytes: 1024 });
  // Auth pages are intentionally lean; guard against blank, not against small.
  await checkHtml("/login/", { minBytes: 400 });
  await checkHtml("/register/", { minBytes: 400 });

  const breaking = [...new Set(homeHtml.match(/\/breaking\/[a-z0-9-]+\//g) ?? [])];
  if (breaking.length === 0) {
    console.log("no breaking groups on home — /breaking/* skipped (expected locally: KV is empty)");
  }
  for (const route of breaking) await checkHtml(route);
} catch (err) {
  fail("(setup)", err?.message ?? String(err));
} finally {
  stopServer();
}

if (failures.length > 0) {
  console.error(`\nFAIL — ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nall anonymous-leak checks passed");
