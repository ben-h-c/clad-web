/**
 * One-off backfill: re-date existing posts by their source video's real YouTube
 * publish date instead of the import date. Reads every src/content/posts/*.md,
 * looks up each videoId via the YouTube Data API (batched), and rewrites the
 * `publishedAt:` line to the video's actual publish date (YYYY-MM-DD).
 *
 * Posts without a videoId (verdict posts) and videos the API no longer returns
 * (deleted/private) are left untouched.
 *
 * Run:  node --env-file=runner/.env scripts/backfillDates.mjs [--dry]
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

const DIR = "src/content/posts";
const KEY = process.env.YOUTUBE_API_KEY;
const DRY = process.argv.includes("--dry");

if (!KEY) {
  console.error("YOUTUBE_API_KEY not set. Run: node --env-file=runner/.env scripts/backfillDates.mjs");
  process.exit(1);
}

const files = (await readdir(DIR)).filter((f) => f.endsWith(".md"));
const entries = [];
for (const f of files) {
  const fp = path.join(DIR, f);
  const txt = await readFile(fp, "utf8");
  const vid = txt.match(/^videoId:\s*"([^"]+)"/m)?.[1];
  const cur = txt.match(/^publishedAt:\s*(.+)$/m)?.[1]?.trim();
  if (!vid) continue;
  entries.push({ fp, txt, vid, cur });
}
console.log(`${entries.length} posts with a videoId (of ${files.length} total)`);

const ids = [...new Set(entries.map((e) => e.vid))];
const dateById = new Map();
for (let i = 0; i < ids.length; i += 50) {
  const batch = ids.slice(i, i + 50);
  const params = new URLSearchParams({ key: KEY, part: "snippet", id: batch.join(",") });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
  if (!r.ok) {
    console.error("\nYouTube API error", r.status, await r.text());
    process.exit(1);
  }
  const d = await r.json();
  for (const it of d.items || []) {
    const pa = it.snippet?.publishedAt;
    if (pa) dateById.set(it.id, pa.slice(0, 10));
  }
  process.stdout.write(`fetched ${Math.min(i + 50, ids.length)}/${ids.length}\r`);
}
console.log("");

let changed = 0;
let missing = 0;
const histo = {};
for (const e of entries) {
  const nd = dateById.get(e.vid);
  if (!nd) {
    missing++;
    continue;
  }
  histo[nd] = (histo[nd] || 0) + 1;
  if (nd !== e.cur) {
    const updated = e.txt.replace(/^publishedAt:\s*.+$/m, `publishedAt: ${nd}`);
    if (!DRY) await writeFile(e.fp, updated);
    changed++;
  }
}

console.log(`changed ${changed} · unchanged ${entries.length - changed - missing} · no YT date ${missing}`);
console.log(
  "date distribution:\n  " +
    Object.entries(histo)
      .sort()
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n  ")
);
if (DRY) console.log("\n(dry run — no files written)");
