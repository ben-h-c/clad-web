#!/usr/bin/env node
/**
 * Image-licensing gate (docs/legal/image-claims.md). Fails CI when any image
 * on the site could carry third-party rights we don't hold.
 *
 * Invariants enforced:
 *  1. Every post's `thumbnail` frontmatter is one of:
 *       - the YouTube CDN still of THAT post's own videoId
 *         (img.youtube.com or i.ytimg.com, /vi/<videoId>/ or /vi_webp/<videoId>/)
 *       - site-owned generated art (/generated/<file>.{png,jpg,jpeg,webp})
 *       - empty / absent
 *     Anything else — another video's still, a source page's og:image, a wire
 *     or stock photo URL — is exactly how wire-service demand letters
 *     (see docs/legal/image-claims.md) enter the corpus.
 *  2. Referenced /generated/ files actually exist under public/.
 *  3. No template hardcodes an <img src="https://..."> pointing at a host
 *     outside the allowlist (YouTube CDN only). Dynamic thumbnails are covered
 *     by invariant 1; this catches literal one-off embeds.
 *
 * Run: node scripts/checkImageLicense.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, "src", "content", "posts");
const PUBLIC_DIR = path.join(ROOT, "public");
const TEMPLATE_DIRS = ["src/components", "src/layouts", "src/pages"].map((d) => path.join(ROOT, d));

const IMG_HOST_ALLOWLIST = new Set(["img.youtube.com", "i.ytimg.com"]);

const failures = [];

// --- 1 + 2: post frontmatter provenance ------------------------------------
const fmField = (src, name) => {
  const m = src.match(new RegExp(`^${name}: *"?([^"\\n]+?)"? *$`, "m"));
  return m ? m[1].trim() : null;
};

const ownStill = (url, videoId) => {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (!IMG_HOST_ALLOWLIST.has(u.hostname)) return false;
  return (
    videoId &&
    (u.pathname.startsWith(`/vi/${videoId}/`) || u.pathname.startsWith(`/vi_webp/${videoId}/`))
  );
};

const OWNED_GENERATED_RE = /^(?:https:\/\/(?:www\.)?cladfacts\.com)?(\/generated\/[\w.-]+\.(?:png|jpe?g|webp))$/;
const ownedGenerated = (url) => OWNED_GENERATED_RE.test(url);
const generatedPath = (url) => url.match(OWNED_GENERATED_RE)?.[1] ?? null;

let checked = 0;
for (const f of fs.readdirSync(POSTS_DIR)) {
  if (!f.endsWith(".md")) continue;
  const src = fs.readFileSync(path.join(POSTS_DIR, f), "utf8");
  const thumbnail = fmField(src, "thumbnail");
  if (!thumbnail) continue;
  checked++;
  const videoId = fmField(src, "videoId");
  if (ownStill(thumbnail, videoId)) continue;
  if (ownedGenerated(thumbnail)) {
    const rel = generatedPath(thumbnail).replace(/^\//, "");
    if (!fs.existsSync(path.join(PUBLIC_DIR, rel))) {
      failures.push(`${f}: thumbnail references missing file ${thumbnail}`);
    }
    continue;
  }
  failures.push(
    `${f}: thumbnail is not this post's own YouTube still or owned /generated/ art: ${thumbnail}`
  );
}

// --- 3: hardcoded external <img> hosts in templates -------------------------
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(astro|ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
};

const IMG_SRC_RE = /<img[^>]*\ssrc=["'](https?:\/\/[^"']+)["']/gi;
for (const dir of TEMPLATE_DIRS) {
  for (const file of walk(dir)) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(IMG_SRC_RE)) {
      let host;
      try {
        host = new URL(m[1]).hostname;
      } catch {
        continue;
      }
      if (!IMG_HOST_ALLOWLIST.has(host)) {
        failures.push(`${path.relative(ROOT, file)}: hardcoded external <img> host ${host} (${m[1]})`);
      }
    }
  }
}

if (failures.length) {
  console.error(`image-license check FAILED (${failures.length} issue${failures.length === 1 ? "" : "s"}):\n`);
  for (const f of failures) console.error("  ✗ " + f);
  console.error(
    "\nPost artwork must be the post's own YouTube still or site-owned /generated/ art — see docs/legal/image-claims.md."
  );
  process.exit(1);
}

console.log(`image-license check passed: ${checked} thumbnails verified, no external image hosts outside allowlist.`);
