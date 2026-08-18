/**
 * Prepare a short muted H264 loop of the current Breaking/Cover lead and
 * POST it to /api/agent/ambient. Uses yt-dlp (android client) + ffmpeg on
 * the Mac — Worker IPs cannot resolve YouTube streams.
 *
 *   cd runner && node --env-file=.env ambientClip.mjs
 *
 * Auto-runs from the breaking curator so the Cover clip tracks the lead.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBreaking, getPosts } from "./api.mjs";

const BASE = process.env.WORKER_BASE_URL || "http://localhost:8787";
const TOKEN = process.env.AGENT_TOKEN || "";
const START_SEC = 6;
const DURATION_SEC = 20;

export async function resolveLeadVideoId() {
  const [breaking, postsRes] = await Promise.all([getBreaking(), getPosts()]);
  if (!breaking.ok) return { ok: false, message: `breaking ${breaking.status}` };
  if (!postsRes.ok) return { ok: false, message: `posts ${postsRes.status}` };
  const items = breaking.body.items || [];
  const lead = items[0];
  if (!lead) return { ok: false, message: "no breaking lead" };
  const byId = new Map((postsRes.body.posts || []).map((p) => [p.id, p]));
  const ids = lead.type === "group" ? lead.ids || [] : [lead.id];
  const members = ids.map((id) => byId.get(id)).filter(Boolean);
  members.sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
  const hit = members.find((p) => p.videoId && /^[\w-]{11}$/.test(p.videoId));
  if (!hit) return { ok: false, message: "lead has no video id" };
  return { ok: true, videoId: hit.videoId, postId: hit.id };
}

async function currentMeta() {
  const res = await fetch(`${BASE}/api/agent/ambient`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return body.meta || null;
}

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8" });
}

export function cutAmbientClip(videoId, outPath) {
  const dir = mkdtempSync(join(tmpdir(), "clad-ambient-"));
  const full = join(dir, `${videoId}.src.mp4`);
  try {
    const dl = run("yt-dlp", [
      "-f",
      "18/134/best[ext=mp4][height<=480]/best[height<=480]",
      "--extractor-args",
      "youtube:player_client=android",
      "--downloader",
      "native",
      "--no-part",
      "--no-playlist",
      "-o",
      full,
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);
    if (dl.status !== 0) {
      return { ok: false, message: (dl.stderr || dl.stdout || "yt-dlp failed").slice(-400) };
    }
    const ff = run("ffmpeg", [
      "-y",
      "-ss",
      String(START_SEC),
      "-t",
      String(DURATION_SEC),
      "-i",
      full,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-vf",
      "scale=-2:480",
      outPath,
    ]);
    if (ff.status !== 0) {
      return { ok: false, message: (ff.stderr || "ffmpeg failed").slice(-400) };
    }
    return { ok: true };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function uploadAmbientClip(videoId, filePath) {
  const bytes = readFileSync(filePath);
  const res = await fetch(`${BASE}/api/agent/ambient`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "video/mp4",
      "X-Ambient-Video-Id": videoId,
    },
    body: bytes,
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) return { ok: false, message: `upload ${res.status} ${JSON.stringify(body).slice(0, 200)}` };
  return { ok: true, meta: body.meta };
}

export async function ensureAmbientClip({ force = false } = {}) {
  if (!TOKEN) return { ok: false, message: "AGENT_TOKEN not set" };
  const lead = await resolveLeadVideoId();
  if (!lead.ok) return lead;
  if (!force) {
    const meta = await currentMeta();
    if (meta?.videoId === lead.videoId && Number(meta.byteLength) > 256) {
      return { ok: true, message: `already ${lead.videoId}`, videoId: lead.videoId, skipped: true };
    }
  }
  const out = join(tmpdir(), `clad-ambient-${lead.videoId}.mp4`);
  const cut = cutAmbientClip(lead.videoId, out);
  if (!cut.ok) return cut;
  try {
    const up = await uploadAmbientClip(lead.videoId, out);
    if (!up.ok) return up;
    return { ok: true, message: `clip ${lead.videoId} ${up.meta?.byteLength || ""}`, videoId: lead.videoId };
  } finally {
    try {
      rmSync(out, { force: true });
    } catch {
      /* ignore */
    }
  }
}

const invoked = process.argv[1] && /ambientClip\.mjs$/.test(process.argv[1]);
if (invoked) {
  const force = process.argv.includes("--force");
  ensureAmbientClip({ force })
    .then((r) => {
      console.log(new Date().toISOString(), r.ok ? "ok" : "fail", r.message || r);
      process.exit(r.ok ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
