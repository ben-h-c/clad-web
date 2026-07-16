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

/* ---------- dynamic post text -------------------------------------------
 * Every post used to open with the same static "REPORT CARD — <headline>"
 * block, which reads like a bot in a feed. Instead, lead with the most
 * interesting SIGNAL the report actually carries — a failing grade, the
 * disputed claim itself, a clean sheet, a hard lean — and rotate phrasings
 * deterministically (seeded by slug) so reruns of the same post are stable
 * but the account's feed isn't a wall of identical templates.
 * House voice everywhere: restrained broadsheet — specific, active, no
 * exclamation points, no hashtag spam, no clickbait withholding.
 */

function slugSeed(slug) {
  let h = 5381;
  for (const c of slug) h = (((h * 33) >>> 0) ^ c.codePointAt(0)) >>> 0;
  return h;
}
const pick = (arr, seed) => arr[seed % arr.length];
/** "an F", "an A-", "a B+" — article follows the letter's pronunciation. */
const aGrade = (g) => (/^[AF]/.test(g) ? `an ${g}` : `a ${g}`);
const clipText = (s, n) => ([...s].length > n ? [...s].slice(0, n - 1).join("").trimEnd() + "…" : s);

/** The single most attention-worthy disputed/unsupported claim, if any. */
function contestedMoment(moments) {
  const bad = (moments ?? []).filter((m) => {
    const v = String(m.verdict || "").toLowerCase();
    return v && v !== "verified";
  });
  // Prefer an outright "disputed" over "missing context"/"unsupported".
  return bad.find((m) => String(m.verdict).toLowerCase() === "disputed") ?? bad[0] ?? null;
}

function outletName(fm) {
  return (fm.sourceTitle || "").trim() || "This broadcast";
}

/** Opening hook, chosen by the report's strongest signal. */
function buildHook(fm, seed) {
  const outlet = outletName(fm);
  const grade = fm.letterGrade || "";
  const tally = claimTally(fm.keyMoments);
  const contested = contestedMoment(fm.keyMoments);
  const leanN = Number(fm.leanScore);
  const failing = /^[DF]/.test(grade);
  const strong = /^A/.test(grade);

  // 1) A failing grade is the story.
  if (failing) {
    return pick(
      [
        `${outlet} walked away with ${aGrade(grade)} on this one.`,
        `${aGrade(grade).replace(/^a/, "A")} report card for ${outlet}. The receipts are itemized.`,
        `We graded this ${outlet} segment claim by claim. It earned ${aGrade(grade)}.`,
      ],
      seed
    );
  }
  // 2) A specific claim that didn't survive review — quote it.
  if (contested && tally.total > 0) {
    const v = String(contested.verdict).toLowerCase();
    const verdictWord = v === "disputed" ? "Disputed" : v === "unsupported" ? "Unsupported" : "Missing context";
    return pick(
      [
        `“${clipText(contested.claim, 140)}” — ${verdictWord.toLowerCase()}, per our review.`,
        `Claim: “${clipText(contested.claim, 130)}” Verdict: ${verdictWord}.`,
        `${tally.verified} of ${tally.total} claims held up. This one didn't: “${clipText(contested.claim, 110)}”`,
      ],
      seed
    );
  }
  // 3) A clean sheet is rarer than readers think — say so plainly.
  if (strong && tally.total > 0 && tally.verified === tally.total) {
    return pick(
      [
        `A clean sheet: every claim we checked in this ${outlet} segment held up. ${grade}.`,
        `${tally.verified} claims checked, ${tally.verified} verified. ${outlet} earns ${aGrade(grade)}.`,
        `This is what ${aGrade(grade)} broadcast looks like: ${tally.verified}/${tally.total} claims verified.`,
      ],
      seed
    );
  }
  // 4) A hard lean is worth naming.
  if (Number.isFinite(leanN) && Math.abs(leanN) >= 50) {
    const dir = leanN > 0 ? "right" : "left";
    return pick(
      [
        `The facts mostly held. The framing leans ${Math.abs(leanN)}% ${dir}. Both are on the card.`,
        `Graded for accuracy — and for the ${Math.abs(leanN)}% ${dir} tilt in how it was told.`,
      ],
      seed
    );
  }
  // 5) Default: the sharpest verified claim, or the mixed-tally tension.
  const first = (fm.keyMoments ?? [])[0];
  if (tally.total > 0 && tally.verified < tally.total) {
    return pick(
      [
        `${tally.verified} of ${tally.total} claims in this ${outlet} segment survived a fact-check.`,
        `We checked ${tally.total} claims from ${outlet}. ${tally.verified} held up.`,
      ],
      seed
    );
  }
  if (first?.claim) {
    return pick(
      [
        `“${clipText(first.claim, 140)}” — we checked it.`,
        `On the record: “${clipText(first.claim, 140)}”`,
      ],
      seed
    );
  }
  return null; // fall back to headline-led text
}

/** Compact scoreboard line (grade is fine here — this is our own post). */
function statLine(fm) {
  const grade = fm.letterGrade || "?";
  const score = fm.factualityScore != null ? fm.factualityScore : "?";
  const lean = leanPhrase(fm);
  return `Grade ${grade} · Factuality ${score}/100` + (lean ? ` · ${lean}` : "");
}

/**
 * Build both platform texts:
 *  - paste: X/Threads paste-ready (hook + headline + stats + URL)
 *  - bsky:  Bluesky record text (hook + headline + stats; NO raw URL — the
 *           external link card carries the link, so the text stays clean)
 * Bluesky hard limit ~300 graphemes; trim hook → headline as needed.
 */
function buildTexts(fm, url, slug) {
  const headline = fm.headline || "CladFacts report";
  const seed = slugSeed(slug);
  const hook = buildHook(fm, seed);
  const stats = statLine(fm);

  const headlineLine = hook ? headline : `REPORT CARD — ${headline}`;
  const lines = hook ? [hook, headlineLine, stats] : [headlineLine, stats];

  let bsky = lines.join("\n");
  if ([...bsky].length > 292) {
    const shortHead = clipText(headline, 80);
    bsky = (hook ? [clipText(hook, 160), shortHead, stats] : [`REPORT CARD — ${shortHead}`, stats]).join("\n");
    if ([...bsky].length > 292) bsky = [clipText(hook ?? shortHead, 170), stats].join("\n");
  }

  const paste = [...lines, url].join("\n");
  return { bsky, paste };
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

async function postToBluesky(text, url, imageBytes, card) {
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

  // External link-card embed, with the OG report card as its thumbnail. An
  // image embed only opens a lightbox when tapped; the external card makes the
  // WHOLE card click through to the article — that's the traffic we post for.
  // Thumb is best-effort: missing OG after deploy must not fail announce.
  const embed = {
    $type: "app.bsky.embed.external",
    external: {
      uri: url,
      title: card?.title || "CladFacts report card",
      description: card?.description || "Fact-checked, graded, and rated for bias.",
    },
  };
  if (imageBytes && imageBytes.length > 0) {
    const blobRes = await (
      await fetch(`${pds}/com.atproto.repo.uploadBlob`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "image/png" },
        body: imageBytes,
      })
    ).json();
    if (blobRes.blob) {
      embed.external.thumb = blobRes.blob;
    } else {
      console.log("[bsky] thumb upload failed, link card without image:", JSON.stringify(blobRes).slice(0, 200));
    }
  }
  record.embed = embed;

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
    const { bsky, paste } = buildTexts(fm, postUrl, slug);
    // Link-card copy (Bluesky external embed) — our own post, so the grade may
    // appear here; keep it scoreboard-factual.
    const card = {
      title: fm.headline || "CladFacts report card",
      description: statLine(fm),
    };

    console.log(`\n──── ${slug} ────`);
    console.log(`[X/Threads paste ready — not auto-posted]\n${paste}\n`);
    console.log(`[Bluesky record text]\n${bsky}\n`);

    if (DRY) {
      console.log("[dry run] skipping Bluesky · card", cardUrl);
      continue;
    }
    if (!envTrim("BSKY_HANDLE") || !envTrim("BSKY_APP_PASSWORD")) {
      console.log("[skip] BSKY_* secrets not set — printed text only");
      continue;
    }

    // Retry OG for deploy lag; the link card still posts (without a thumb) if
    // the image never appears — the link is what matters.
    const img = await fetchOgPng(cardUrl);
    if (!img) {
      console.log(`[og] giving up on card thumb — posting link card without image (${cardUrl})`);
    }
    const uri = await postToBluesky(bsky, postUrl, img, card);
    console.log(img ? "bluesky ✓" : "bluesky ✓ (no thumb)", uri);
  } catch (err) {
    failed++;
    console.error(`announce failed for ${path}:`, err?.message ?? err);
  }
}

// Only hard-fail on real errors (auth, etc.). Missing OG is handled above.
if (failed) process.exit(1);
