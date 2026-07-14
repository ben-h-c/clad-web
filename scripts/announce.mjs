#!/usr/bin/env node
/**
 * Announce a newly published CladFacts post (Bluesky + printed X/Threads text).
 *
 * Usage:
 *   DRY_RUN=1 node scripts/announce.mjs src/content/posts/2026-07-14-example.md
 *   node scripts/announce.mjs path/to/post.md [...]
 *
 * Env:
 *   SITE_URL              default https://cladfacts.com
 *   BSKY_HANDLE           e.g. cladfacts.bsky.social (optional if DRY_RUN)
 *   BSKY_APP_PASSWORD     Bluesky app password (not your real password)
 *   DRY_RUN=1             print only; never post
 *
 * Frontmatter contract = clad-web broadcast posts:
 *   headline, letterGrade, factualityScore, keyMoments[], leanScore/politicalLean
 * (Not the growth-kit's grade/score/claims shape.)
 *
 * Guardrails: human already approved the post via /admin/queue before it lands
 * in git. This only distributes what was published.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const SITE = (process.env.SITE_URL || "https://cladfacts.com").replace(/\/$/, "");
const DRY = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

/** Trim secret values — trailing newlines from GitHub paste are a common auth fail. */
function envTrim(name) {
  const v = process.env[name];
  return v == null ? "" : String(v).trim();
}

function strip(v) {
  return String(v ?? "")
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

/** Minimal YAML frontmatter reader for our flat + nested keyMoments lists. */
function frontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw new Error("no frontmatter");
  const out = { keyMoments: [] };
  let inMoments = false;
  let current = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (/^keyMoments:\s*$/.test(line)) {
      inMoments = true;
      current = null;
      continue;
    }
    if (inMoments) {
      const item = line.match(/^\s+-\s+claim:\s*(.+)$/);
      if (item) {
        current = { claim: strip(item[1]), verdict: "", note: "" };
        out.keyMoments.push(current);
        continue;
      }
      const kv = line.match(/^\s{2,}(verdict|note):\s*(.+)$/);
      if (kv && current) {
        current[kv[1]] = strip(kv[2]);
        continue;
      }
      if (/^\S/.test(line) && line.includes(":")) {
        inMoments = false;
        current = null;
        // fall through to top-level parse
      } else {
        continue;
      }
    }
    const top = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!top) continue;
    const key = top[1];
    const val = top[2];
    if (val === "" || val === "|" || val === ">") continue;
    if (key === "topics" || key === "notableConcerns" || key === "citations" || key === "politicians") {
      continue; // lists ignored for announce text
    }
    out[key] = strip(val);
  }
  return out;
}

function claimTally(moments) {
  let verified = 0;
  let disputed = 0;
  let other = 0;
  for (const m of moments ?? []) {
    const v = String(m.verdict || "").toLowerCase();
    if (v === "verified") verified++;
    else if (v === "disputed") disputed++;
    else if (v) other++;
  }
  return { verified, disputed, other, total: verified + disputed + other };
}

function leanPhrase(fm) {
  const n = Number(fm.leanScore);
  if (Number.isFinite(n)) {
    if (Math.abs(n) < 5) return "Centered";
    return `${Math.abs(n)}% ${n > 0 ? "Right" : "Left"}-leaning`;
  }
  const map = {
    left: "Left-leaning",
    "center-left": "Center-left",
    center: "Centered",
    "center-right": "Center-right",
    right: "Right-leaning",
    none: "Centered",
  };
  return map[fm.politicalLean] ?? null;
}

function buildText(fm, url) {
  const headline = fm.headline || "CladFacts report";
  const grade = fm.letterGrade || "?";
  const score = fm.factualityScore != null ? fm.factualityScore : "?";
  const tally = claimTally(fm.keyMoments);
  const lean = leanPhrase(fm);
  const lines = [
    `REPORT CARD — ${headline}`,
    `Grade: ${grade} · Factuality ${score}/100` + (lean ? ` · ${lean}` : ""),
  ];
  if (tally.total > 0) {
    lines.push(
      `${tally.verified} verified · ${tally.disputed} disputed · ${tally.other} missing context/unsupported`
    );
  }
  lines.push(url);
  // Bluesky hard limit ~300 graphemes; truncate headline block if needed.
  let text = lines.join("\n");
  if ([...text].length > 300) {
    const shortHead = headline.length > 80 ? headline.slice(0, 77) + "…" : headline;
    text = [
      `REPORT CARD — ${shortHead}`,
      `Grade: ${grade} · Factuality ${score}/100`,
      url,
    ].join("\n");
  }
  return text;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Workers Builds often take longer than a fixed 90s sleep after an agent
 * publish. Retry OG fetch so we don't fail the whole Distribute run (and spam
 * GitHub failure emails) when the card is simply not live yet.
 * Returns null if still unavailable — caller posts text-only.
 */
async function fetchOgPng(cardUrl, { attempts = 10, delayMs = 20000 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(cardUrl, {
        headers: { Accept: "image/png,*/*", "User-Agent": "clad-announce/1.0" },
        redirect: "follow",
      });
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        // PNG magic bytes — reject empty bodies / HTML error pages.
        const isPng = buf.length > 500 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
        if (isPng) return buf;
        console.log(`[og] attempt ${i}/${attempts}: ${res.status} but not a usable PNG (${buf.length} bytes)`);
      } else {
        console.log(`[og] attempt ${i}/${attempts}: HTTP ${res.status} ${cardUrl}`);
      }
    } catch (err) {
      console.log(`[og] attempt ${i}/${attempts}: ${err?.message || err}`);
    }
    if (i < attempts) await sleep(delayMs);
  }
  return null;
}

async function postToBluesky(text, url, imageBytes, alt) {
  // Identifier: handle without leading @, or the account email. App password only
  // (Settings → Privacy and security → App Passwords) — not the account password.
  let handle = envTrim("BSKY_HANDLE").replace(/^@/, "");
  const password = envTrim("BSKY_APP_PASSWORD");
  if (!handle || !password) {
    throw new Error("BSKY_HANDLE and BSKY_APP_PASSWORD are required to post");
  }
  const pds = "https://bsky.social/xrpc";
  const session = await (
    await fetch(`${pds}/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: handle, password }),
    })
  ).json();
  if (!session.accessJwt) {
    throw new Error(
      "bsky auth failed: " +
        JSON.stringify(session) +
        " — check BSKY_HANDLE (no @; full handle like name.bsky.social or email) " +
        "and BSKY_APP_PASSWORD (Bluesky *app* password, not login password)"
    );
  }
  const auth = { Authorization: `Bearer ${session.accessJwt}` };

  const enc = new TextEncoder();
  const idx = text.indexOf(url);
  const facets =
    idx === -1
      ? []
      : [
          {
            index: {
              byteStart: enc.encode(text.slice(0, idx)).length,
              byteEnd: enc.encode(text.slice(0, idx)).length + enc.encode(url).length,
            },
            features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
          },
        ];

  const record = {
    $type: "app.bsky.feed.post",
    text,
    facets,
    langs: ["en"],
    createdAt: new Date().toISOString(),
  };

  // Image is best-effort: missing OG after deploy must not fail announce.
  if (imageBytes && imageBytes.length > 0) {
    const blobRes = await (
      await fetch(`${pds}/com.atproto.repo.uploadBlob`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "image/png" },
        body: imageBytes,
      })
    ).json();
    if (blobRes.blob) {
      record.embed = {
        $type: "app.bsky.embed.images",
        images: [{ image: blobRes.blob, alt: alt || "CladFacts report card" }],
      };
    } else {
      console.log("[bsky] blob upload failed, posting text-only:", JSON.stringify(blobRes).slice(0, 200));
    }
  }

  const post = await (
    await fetch(`${pds}/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record,
      }),
    })
  ).json();
  if (!post.uri) throw new Error("bsky post failed: " + JSON.stringify(post));
  return post.uri;
}

const paths = process.argv.slice(2).filter((p) => p && p.endsWith(".md"));
if (paths.length === 0) {
  console.error("usage: node scripts/announce.mjs <post.md> [...]");
  process.exit(2);
}

let failed = 0;
for (const path of paths) {
  try {
    const fm = frontmatter(readFileSync(path, "utf8"));
    if (fm.draft === "true" || fm.draft === true) {
      console.log(`skip draft ${path}`);
      continue;
    }
    const slug = basename(path).replace(/\.mdx?$/, "");
    const postUrl = `${SITE}/posts/${slug}/`;
    const cardUrl = `${SITE}/og/${slug}.png`;
    const text = buildText(fm, postUrl);
    const alt = `CladFacts report card: ${fm.headline || slug}. Grade ${fm.letterGrade ?? "?"}, factuality ${fm.factualityScore ?? "?"}/100.`;

    console.log(`\n──── ${slug} ────\n${text}\n`);
    console.log("[X/Threads paste ready — not auto-posted]");

    if (DRY) {
      console.log("[dry run] skipping Bluesky · card", cardUrl);
      continue;
    }
    if (!envTrim("BSKY_HANDLE") || !envTrim("BSKY_APP_PASSWORD")) {
      console.log("[skip] BSKY_* secrets not set — printed text only");
      continue;
    }

    // Retry OG for deploy lag; post text-only if card never appears (still success).
    const img = await fetchOgPng(cardUrl);
    if (!img) {
      console.log(`[og] giving up on card — posting text-only to Bluesky (${cardUrl})`);
    }
    const uri = await postToBluesky(text, postUrl, img, alt);
    console.log(img ? "bluesky ✓" : "bluesky ✓ (text-only)", uri);
  } catch (err) {
    failed++;
    console.error(`announce failed for ${path}:`, err?.message ?? err);
  }
}

// Only hard-fail on real errors (auth, etc.). Missing OG is handled above.
if (failed) process.exit(1);
