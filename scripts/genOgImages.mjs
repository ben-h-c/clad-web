/**
 * Build step: generate a social-preview PNG for every published post into
 * public/og/<slug>.png. Runs in plain Node before `astro build` so the Cloudflare
 * Worker just serves the static images. See ogCard.mjs for the rendering.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { renderOgCard } from "./ogCard.mjs";

const cwd = process.cwd();
const POSTS_DIR = path.join(cwd, "src/content/posts");
const OUT_DIR = path.join(cwd, "public/og");

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

export async function generateOgImages() {
  if (!fs.existsSync(POSTS_DIR)) {
    console.log("[og] no posts dir; skipping");
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  let made = 0;
  for (const file of files) {
    const { data: d } = matter(fs.readFileSync(path.join(POSTS_DIR, file), "utf8"));
    if (d.draft) continue;
    const slug = file.replace(/\.md$/, "");
    const isBroadcast = d.type === "broadcast";

    try {
      const png = await renderOgCard({
        headline: d.headline,
        badge: isBroadcast ? d.letterGrade ?? "—" : VERDICT_LABELS[d.verdict] ?? "—",
        badgeLabel: isBroadcast ? "ARTICLE GRADE" : "VERDICT",
        lean: isBroadcast ? leanLabel(d.leanScore, d.politicalLean) : null,
        factuality: isBroadcast && typeof d.factualityScore === "number" ? d.factualityScore : null,
        source: d.sourceTitle ?? null,
        thumbnail: d.thumbnail,
      });
      fs.writeFileSync(path.join(OUT_DIR, `${slug}.png`), png);
      made++;
    } catch (err) {
      console.error(`[og] failed for ${slug}: ${err?.message || err}`);
    }
  }
  console.log(`[og] generated ${made} preview images -> public/og/`);
}

// Allow running directly: `node scripts/genOgImages.mjs`
if (process.argv[1] && process.argv[1].endsWith("genOgImages.mjs")) {
  generateOgImages().catch((e) => {
    console.error("[og] fatal:", e);
    process.exit(1);
  });
}
