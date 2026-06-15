/**
 * Build step: generate a social-preview PNG for every published post and topic
 * into public/og/. Runs in plain Node before `astro build` so the Cloudflare
 * Worker just serves the static images. See ogCard.mjs for the rendering.
 *
 * INCREMENTAL: rendering each card is CPU-heavy (~0.5-1s), so a full pass over
 * every card on every deploy is slow and was timing builds out. We keep the
 * generated PNGs committed to the repo plus a manifest of content hashes, and
 * only re-render a card when its inputs change. Bump CARD_VERSION to force a
 * full re-render after a design change.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";
import { renderOgCard } from "./ogCard.mjs";
import { aggregateTopics } from "./topicsAgg.mjs";

const cwd = process.cwd();
const POSTS_DIR = path.join(cwd, "src/content/posts");
const OUT_DIR = path.join(cwd, "public/og");
const MANIFEST = path.join(OUT_DIR, "manifest.json");
const CARD_VERSION = 1; // bump to invalidate all cards after a design change

const VERDICT_LABELS = {
  true: "True", "mostly-true": "Mostly True", mixed: "Mixed",
  "mostly-false": "Mostly False", false: "False", unverified: "Unverified",
};
const ENUM_TO_SCORE = { left: -80, "center-left": -40, center: 0, "center-right": 40, right: 80, none: 0 };

function leanLabel(score, lean) {
  const s = typeof score === "number" ? score : lean ? (ENUM_TO_SCORE[lean] ?? null) : null;
  if (s === null) return null;
  return Math.abs(s) < 5 ? "Centered" : `${Math.abs(s)}% ${s > 0 ? "Right" : "Left"}-leaning`;
}

function hashOf(obj) {
  return crypto.createHash("sha1").update(`${CARD_VERSION}:` + JSON.stringify(obj)).digest("hex").slice(0, 16);
}

export async function generateOgImages() {
  if (!fs.existsSync(POSTS_DIR)) {
    console.log("[og] no posts dir; skipping");
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let oldManifest = {};
  try {
    oldManifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  } catch {
    oldManifest = {};
  }
  const newManifest = {};
  const expected = new Set(["manifest.json"]);
  let rendered = 0;
  let skipped = 0;
  let deferred = 0;

  // Hard wall-clock budget for new renders: the build must never hang here
  // (Cloudflare kills builds at 20 min). Cached cards are always free; only
  // NEW/changed cards count against this. Anything past the budget is left for
  // the next build (its existing image, if any, keeps serving).
  const startTime = Date.now();
  const MAX_MS = 120_000;

  // One unit of work: render `file` only if its content hash changed.
  async function ensureCard(file, hash, render) {
    expected.add(file);
    const exists = fs.existsSync(path.join(OUT_DIR, file));
    if (exists && oldManifest[file] === hash) {
      newManifest[file] = hash;
      skipped++;
      return;
    }
    if (Date.now() - startTime > MAX_MS) {
      deferred++; // over budget — retry next build (no manifest entry, file kept)
      return;
    }
    try {
      const png = await render();
      fs.writeFileSync(path.join(OUT_DIR, file), png);
      newManifest[file] = hash;
      rendered++;
    } catch (err) {
      console.error(`[og] failed for ${file}: ${err?.message || err}`);
    }
  }

  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  const pseudoPosts = [];
  for (const file of files) {
    const { data: d } = matter(fs.readFileSync(path.join(POSTS_DIR, file), "utf8"));
    if (d.draft) continue;
    const slug = file.replace(/\.md$/, "");
    const isBroadcast = d.type === "broadcast";
    pseudoPosts.push({ id: slug, data: { ...d, publishedAt: new Date(d.publishedAt) } });

    const card = {
      headline: d.headline,
      badge: isBroadcast ? d.letterGrade ?? "—" : VERDICT_LABELS[d.verdict] ?? "—",
      badgeLabel: isBroadcast ? "ARTICLE GRADE" : "VERDICT",
      lean: isBroadcast ? leanLabel(d.leanScore, d.politicalLean) : null,
      factuality: isBroadcast && typeof d.factualityScore === "number" ? d.factualityScore : null,
      thumbnail: d.thumbnail,
    };
    await ensureCard(`${slug}.png`, hashOf(card), () => renderOgCard(card));
  }

  // Topic-group cards (one per /topics/<slug>/ page) so whole topics share too.
  try {
    for (const t of aggregateTopics(pseudoPosts)) {
      const card = {
        headline: t.display,
        badge: t.avgGrade ?? "—",
        badgeLabel: "AVG GRADE",
        lean: leanLabel(t.avgLean, null),
        metaLine: `TOPIC · ${t.count} ${t.count === 1 ? "REPORT" : "REPORTS"}`,
        thumbnail: t.thumbnail ?? undefined,
      };
      await ensureCard(`topic-${t.slug}.png`, hashOf(card), () => renderOgCard(card));
    }
  } catch (err) {
    console.error(`[og] topic aggregation failed: ${err?.message || err}`);
  }

  // Prune images for posts/topics that no longer exist, to bound repo growth.
  let pruned = 0;
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (!expected.has(f)) {
      fs.rmSync(path.join(OUT_DIR, f), { force: true });
      pruned++;
    }
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(newManifest));
  console.log(
    `[og] ${rendered} rendered, ${skipped} cached, ${deferred} deferred (over ${MAX_MS / 1000}s budget), ${pruned} pruned -> public/og/`
  );
}

// Allow running directly: `node scripts/genOgImages.mjs`
if (process.argv[1] && process.argv[1].endsWith("genOgImages.mjs")) {
  generateOgImages().catch((e) => {
    console.error("[og] fatal:", e);
    process.exit(1);
  });
}
