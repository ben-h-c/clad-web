/**
 * Backfill / repair per-post media framing.
 *
 * Modes:
 *   --defaults   Write mediaStyle:overlay + safe focus (50,32) on every post
 *                that has a thumbnail. Instant, no API. Use this to unbreak
 *                the feed (removes modular/text + wild focus).
 *   --vision     Re-analyze stills with Grok (focus only; always overlay).
 *                Use --limit=N (default 40). Requires XAI_API_KEY.
 *   --force      Overwrite existing media fields.
 *   --dry        Print only.
 *
 * Examples:
 *   node --env-file=.dev.vars scripts/backfillMediaPresentation.mjs --defaults
 *   node --env-file=.dev.vars scripts/backfillMediaPresentation.mjs --vision --limit=60 --force
 *   node --env-file=.dev.vars scripts/backfillMediaPresentation.mjs --defaults --vision --limit=40 --force
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const POSTS = "src/content/posts";
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const force = args.includes("--force");
const doDefaults = args.includes("--defaults") || (!args.includes("--vision") && !args.includes("--defaults"));
const doVision = args.includes("--vision");
const limit = Number((args.find((a) => a.startsWith("--limit=")) || "--limit=40").split("=")[1]) || 40;
const apiKey = process.env.XAI_API_KEY;

const FOCUS_X_MIN = 28,
  FOCUS_X_MAX = 72,
  FOCUS_Y_MIN = 18,
  FOCUS_Y_MAX = 42;
const DEFAULT_X = 50,
  DEFAULT_Y = 32;

function safeFocus(x, y) {
  const clamp = (n, lo, hi, fb) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fb;
  };
  return {
    thumbFocusX: clamp(x, FOCUS_X_MIN, FOCUS_X_MAX, DEFAULT_X),
    thumbFocusY: clamp(y, FOCUS_Y_MIN, FOCUS_Y_MAX, DEFAULT_Y),
  };
}

const files = readdirSync(POSTS)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .reverse();

let defaultsWritten = 0;
let visionWritten = 0;
let skipped = 0;

// ---- Pass 1: safe defaults on every post ----
if (doDefaults) {
  for (const file of files) {
    const path = join(POSTS, file);
    const raw = readFileSync(path, "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) continue;
    let fm = m[1];
    const body = m[2];
    const thumb = fmField(fm, "thumbnail");
    if (!thumb) {
      // No art → text (rare; we still mark it)
      if (!force && /mediaStyle:/.test(fm)) {
        skipped++;
        continue;
      }
      fm = upsertFm(fm, {
        mediaStyle: "text",
        thumbFocusX: 50,
        thumbFocusY: 50,
        mediaNote: "no thumbnail",
      });
      if (!dry) writeFileSync(path, `---\n${fm}\n---\n${body}`);
      defaultsWritten++;
      continue;
    }

    // Always overlay + safe focus. If fields exist and !force, still coerce
    // modular→overlay and clamp focus into safe band.
    const hasFields = /mediaStyle:/.test(fm);
    const curX = numField(fm, "thumbFocusX");
    const curY = numField(fm, "thumbFocusY");
    const curStyle = fmField(fm, "mediaStyle");
    const focus = safeFocus(curX ?? DEFAULT_X, curY ?? DEFAULT_Y);
    const needsFix =
      force ||
      !hasFields ||
      curStyle === "modular" ||
      curStyle === "text" ||
      curX == null ||
      curY == null ||
      curX < FOCUS_X_MIN ||
      curX > FOCUS_X_MAX ||
      curY < FOCUS_Y_MIN ||
      curY > FOCUS_Y_MAX;

    if (!needsFix) {
      skipped++;
      continue;
    }

    fm = upsertFm(fm, {
      mediaStyle: "overlay",
      thumbFocusX: focus.thumbFocusX,
      thumbFocusY: focus.thumbFocusY,
      mediaNote:
        curStyle === "modular" || curStyle === "text"
          ? "repaired: forced overlay (had modular/text)"
          : hasFields
            ? "repaired: clamped focus"
            : "default overlay framing",
    });
    if (!dry) writeFileSync(path, `---\n${fm}\n---\n${body}`);
    defaultsWritten++;
  }
  console.log(`defaults: wrote ${defaultsWritten}, skipped ${skipped}${dry ? " (dry)" : ""}`);
}

// ---- Pass 2: vision focus for newest posts ----
if (doVision) {
  if (!apiKey) {
    console.error("XAI_API_KEY required for --vision");
    process.exit(1);
  }
  let done = 0;
  for (const file of files) {
    if (done >= limit) break;
    const path = join(POSTS, file);
    const raw = readFileSync(path, "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) continue;
    let fm = m[1];
    const body = m[2];
    const thumb = fmField(fm, "thumbnail");
    const headline = fmField(fm, "headline") || file;
    if (!thumb) continue;

    process.stdout.write(`vision ${file} … `);
    let presentation;
    try {
      presentation = await analyze(apiKey, thumb, headline);
    } catch (e) {
      console.log(`FAIL ${(e?.message || e).toString().slice(0, 120)}`);
      continue;
    }
    const focus = safeFocus(presentation.thumbFocusX, presentation.thumbFocusY);
    fm = upsertFm(fm, {
      mediaStyle: "overlay",
      thumbFocusX: focus.thumbFocusX,
      thumbFocusY: focus.thumbFocusY,
      mediaNote: presentation.mediaNote || "vision focus",
    });
    if (!dry) writeFileSync(path, `---\n${fm}\n---\n${body}`);
    console.log(`overlay focus=${focus.thumbFocusX},${focus.thumbFocusY} — ${presentation.mediaNote || ""}`);
    done++;
    visionWritten++;
    await sleep(300);
  }
  console.log(`vision: wrote ${visionWritten}${dry ? " (dry)" : ""}`);
}

console.log("done");

function fmField(fm, key) {
  const re = new RegExp(`^${key}:\\s*(?:"((?:\\\\.|[^"\\\\])*)"|([^\\n]+))`, "m");
  const m = fm.match(re);
  if (!m) return null;
  if (m[1] != null) return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return m[2]?.trim().replace(/^"|"$/g, "") ?? null;
}

function numField(fm, key) {
  const v = fmField(fm, key);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function upsertFm(fm, fields) {
  let out = fm;
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || v === "") continue;
    const line =
      typeof v === "number"
        ? `${k}: ${Math.round(v)}`
        : `${k}: "${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const re = new RegExp(`^${k}:.*$`, "m");
    if (re.test(out)) out = out.replace(re, line);
    else if (/^thumbnail:/m.test(out)) {
      out = out.replace(/^(thumbnail:.*)$/m, `$1\n${line}`);
    } else {
      out = out + "\n" + line;
    }
  }
  return out;
}

async function analyze(apiKey, imageUrl, headline) {
  const system = `You are the photo editor for Clad.
Every card is FULL-BLEED image with text over the bottom third.
Pick object-fit:cover focus only. Return ONLY JSON:
{"thumbFocusX":number,"thumbFocusY":number,"mediaNote":string}
Rules: faces/action upper-middle; talking head ~X 40-60 Y 22-35; never bottom 40%; never extreme edges.`;

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0.1,
      max_tokens: 140,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
            { type: "text", text: `Headline: ${headline}\nFocus only.` },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`${res.status} ${t.slice(0, 160)}`);
  }
  const data = await res.json();
  const p = JSON.parse(data?.choices?.[0]?.message?.content);
  return {
    thumbFocusX: Number(p.thumbFocusX),
    thumbFocusY: Number(p.thumbFocusY),
    mediaNote: String(p.mediaNote || "").slice(0, 200),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
