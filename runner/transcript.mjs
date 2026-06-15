/**
 * Fetch a YouTube transcript using yt-dlp (the only method that reliably gets
 * captions now that YouTube withholds them from hand-rolled requests). Returns
 * the caption text, or null when the video genuinely has no captions. Never
 * throws.
 *
 * Requires yt-dlp on the machine (brew install yt-dlp). Set YT_DLP_PATH if it
 * isn't on PATH (PM2 often has a minimal PATH — runner/.env sets it).
 */
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const YT_DLP = process.env.YT_DLP_PATH || "yt-dlp";

export async function fetchTranscript(videoId, timeoutMs = 45000) {
  let dir;
  try {
    dir = await mkdtemp(join(tmpdir(), "clad-sub-"));
    const args = [
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs", "en.*,en",
      "--sub-format", "json3",
      "--no-playlist",
      "-o", join(dir, "%(id)s"),
      `https://www.youtube.com/watch?v=${videoId}`,
    ];
    await run(YT_DLP, args, timeoutMs);

    const files = (await readdir(dir)).filter((f) => f.endsWith(".json3"));
    if (files.length === 0) return null;
    // Prefer a manual track (no auto-caption marker) when present.
    files.sort((a, b) => score(a) - score(b));
    const raw = await readFile(join(dir, files[0]), "utf8");

    const data = JSON.parse(raw);
    const text = (data.events || [])
      .flatMap((e) => (e.segs || []).map((s) => s.utf8 || ""))
      .join("")
      .replace(/\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    return text.length >= 80 ? text : null;
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Fetch a video's channel + title via yt-dlp (no YouTube Data API). Returns
// { channel, title } or null. Used so manually-submitted URLs get a real source
// name instead of falling back to "youtube.com".
export function fetchVideoMeta(videoId, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const args = [
      "--skip-download",
      "--no-warnings",
      "--no-playlist",
      "--print",
      "%(channel)s\t%(title)s",
      `https://www.youtube.com/watch?v=${videoId}`,
    ];
    execFile(YT_DLP, args, { timeout: timeoutMs }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const line = String(stdout).trim().split("\n")[0] || "";
      const [channel, ...rest] = line.split("\t");
      resolve({
        channel: (channel || "").trim() || null,
        title: rest.join("\t").trim() || null,
      });
    }).on("error", () => resolve(null));
  });
}

// Lower score = preferred. Auto captions (orig / a.<lang>) rank after manual.
function score(name) {
  return /\.orig\.|\.a\.|-orig\./.test(name) ? 1 : 0;
}

function run(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout: timeoutMs }, () => resolve());
    child.on("error", () => resolve());
  });
}
