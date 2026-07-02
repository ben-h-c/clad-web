#!/usr/bin/env node
/**
 * Anonymous post-deploy smoke test.
 *
 * Fails loudly if the site, as served to a logged-out reader on canonical
 * URLs (no cache-busting query strings), leaks Premium values or serves
 * stale pre-deploy HTML. This is exactly the regression observed on
 * 2026-07-01: origin fixed, edge still serving grades to anonymous readers.
 *
 * Usage:  node scripts/smoke-anon.mjs [--base https://cladfacts.com]
 *         SMOKE_BASE=http://localhost:8787 node scripts/smoke-anon.mjs
 */
// Report-of-the-Day pool rules, mirrored from src/lib/sample.ts (which can't
// be imported here — it's TS with extensionless imports). Keep in sync: the
// newest POOL_SIZE broadcasts rotate through the daily slot keyed on the New
// York calendar date. (Every broadcast carries a grade — schema-enforced — so
// filtering on isBroadcast matches sample.ts's letterGrade filter even though
// the anonymous feed nulls the grade itself.)
const SAMPLE_POOL_SIZE = 14;

function sampleUnlockedSlug(posts, date = new Date()) {
  const pool = (posts ?? [])
    .filter((p) => p?.isBroadcast)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, SAMPLE_POOL_SIZE);
  if (pool.length === 0) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const num = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const key = num("year") * 10000 + num("month") * 100 + num("day");
  return pool[key % pool.length].slug ?? null;
}

const argBase = process.argv.indexOf("--base");
const BASE = (
  (argBase > -1 && process.argv[argBase + 1]) ||
  process.env.SMOKE_BASE ||
  "https://cladfacts.com"
).replace(/\/$/, "");

const failures = [];
const note = (msg) => console.log(`  ${msg}`);
const fail = (msg) => {
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

async function get(path) {
  const res = await fetch(BASE + path, {
    redirect: "follow",
    headers: { "User-Agent": "clad-smoke/1.0 (+post-deploy anonymous check)" },
  });
  const text = await res.text();
  return { status: res.status, text };
}

/** Strings that must NEVER appear in logged-out HTML (outside the whitelisted
 *  Report of the Day). Kept in sync with what the gated components render. */
const GATED_PATTERNS = [
  [/class="letter-grade/, "LetterGrade component markup (real grade rendered)"],
  [/%\s*(Left|Right)-leaning/, "political-lean percentage label"],
  [/\bGraded\s+[A-F][+-]?\s*:/, "grade rationale text"],
  [/\bArticle Grade:\s*[A-F][+-]?/, "grade in meta description"],
  [/\bFactuality\s+\d+\/100/, "factuality score"],
];

function checkGated(name, html, { allowOne = false } = {}) {
  for (const [re, what] of GATED_PATTERNS) {
    const matches = html.match(new RegExp(re.source, re.flags + "g")) ?? [];
    // The daily-unlock post legitimately renders one real scoreband on pages
    // that include it; allow a single LetterGrade occurrence there.
    const limit = allowOne && re.source.includes("letter-grade") ? 1 : 0;
    if (matches.length > limit) {
      fail(`${name}: gated content leaked — ${what} (${matches.length}×)`);
    }
  }
}

function todayEt() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

function mastheadIssue(html) {
  const m = html.match(/No\.\s*([\d,]+)/);
  return m ? m[1] : null;
}

console.log(`smoke-anon: checking ${BASE} as a logged-out reader\n`);

// ---- home ------------------------------------------------------------
console.log("home /");
const home = await get("/");
if (home.status !== 200) fail(`/ returned ${home.status}`);
checkGated("/", home.text, { allowOne: true });
const etDate = todayEt();
if (!home.text.includes(etDate)) {
  fail(`/ masthead date is not today's Eastern date ("${etDate}") — stale cache or UTC dateline`);
} else ok(`masthead shows ET date "${etDate}"`);
if (/href="#"/.test(home.text)) fail(`/ contains dead href="#" links`);
else ok("no dead footer links");
const homeIssue = mastheadIssue(home.text);

// quip ticker cap (PR #30: pool capped at 30). Count ticker separators.
const quipCount = (home.text.match(/✦/g) ?? []).length;
if (quipCount > 70) fail(`quip ticker suspiciously long (${quipCount} markers) — stale pre-cap HTML?`);
else note(`quip markers: ${quipCount}`);

// ---- a post (grab the newest from the grade-free RSS) ------------------
console.log("post page");
const rss = await get("/rss.xml");
if (rss.status !== 200) fail(`/rss.xml returned ${rss.status}`);
const postUrl = rss.text.match(/<link>(https?:\/\/[^<]*\/posts\/[^<]+)<\/link>/)?.[1];
checkGated("/rss.xml", rss.text);
if (!postUrl) {
  fail("could not find a post link in /rss.xml");
} else {
  const postPath = new URL(postUrl).pathname;
  const post = await get(postPath);
  if (post.status !== 200) fail(`${postPath} returned ${post.status}`);
  // Whitelist: if this happens to be today's Report of the Day it may show
  // one real scoreband. Compute from the public posts feed with the same
  // shared pool rules the app uses (src/lib/sample.ts, mirrored above).
  let allowOne = false;
  try {
    // The pool is the newest 14 broadcasts, so the first feed page suffices.
    const feed = await get(`/api/posts.json?limit=100`);
    const pool = JSON.parse(feed.text)?.posts ?? [];
    const unlock = sampleUnlockedSlug(pool);
    allowOne = !!unlock && postPath.includes(unlock);
    note(`daily unlock today: ${unlock ?? "n/a"}${allowOne ? " (this post — one grade allowed)" : ""}`);
  } catch {
    note("could not compute daily unlock from /api/posts.json (skipping whitelist)");
  }
  checkGated(postPath, post.text, { allowOne });
  if (!post.text.includes(etDate)) fail(`${postPath} masthead date is not today's ET date`);
  else ok("post masthead shows ET date");
  if (/href="#"/.test(post.text)) fail(`${postPath} contains dead href="#" links`);
  const postIssue = mastheadIssue(post.text);
  if (homeIssue && postIssue && homeIssue !== postIssue) {
    fail(`masthead issue No. differs between / (${homeIssue}) and post (${postIssue}) — stale cache`);
  } else ok("masthead issue No. consistent with home");
}

// ---- a breaking cluster (the 2026-07-01 leak surface) -------------------
console.log("breaking cluster");
const breakingPath = (home.text.match(/href="(\/breaking\/[a-z0-9-]+\/)"/) ?? [])[1];
if (!breakingPath) {
  note("no /breaking/ cluster linked from home right now — skipping");
} else {
  const br = await get(breakingPath);
  if (br.status !== 200) fail(`${breakingPath} returned ${br.status}`);
  checkGated(breakingPath, br.text);
  if (!failures.some((f) => f.startsWith(breakingPath))) ok(`${breakingPath} shows no gated values`);
}

// ---- funnel pages serve real text ---------------------------------------
console.log("funnel pages");
for (const p of ["/discover/", "/good-news/", "/trends/", "/search/", "/upgrade/", "/about/"]) {
  const r = await get(p);
  if (r.status !== 200) {
    fail(`${p} returned ${r.status}`);
    continue;
  }
  checkGated(p, r.text);
  const textish = r.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (textish.length < 500) fail(`${p} served suspiciously little content (${textish.length} chars)`);
  else ok(`${p} serves real content`);
}

// ---- price on the gate ---------------------------------------------------
if (!/\$2\.99\/mo/.test(home.text) && !/\$2\.99/.test(home.text)) {
  note("price string not on home (fine if no gate shown to this tier)");
}

console.log("");
if (failures.length) {
  console.error(`smoke-anon: ${failures.length} FAILURE(S) against ${BASE}`);
  process.exit(1);
}
console.log(`smoke-anon: all checks passed against ${BASE} ✓`);
