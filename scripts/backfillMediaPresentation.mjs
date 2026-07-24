/**
 * Backfill per-post media presentation (mediaStyle + thumbFocusX/Y) by
 * vision-analyzing each still. Used once after shipping the publish-time
 * analyzer so existing home-strip cards stop sharing a blanket crop.
 *
 * Usage:
 *   node --env-file=.dev.vars scripts/backfillMediaPresentation.mjs [--limit=24] [--dry]
 *
 * Writes media fields into post frontmatter; does not commit (git separately).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const POSTS = "src/content/posts";
const limit = Number((process.argv.find((a) => a.startsWith("--limit=")) || "--limit=24").split("=")[1]) || 24;
const dry = process.argv.includes("--dry");
const force = process.argv.includes("--force");
const apiKey = process.env.XAI_API_KEY;
if (!apiKey) {
  console.error("XAI_API_KEY required");
  process.exit(1);
}

const files = readdirSync(POSTS)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .reverse()
  .slice(0, limit * 3); // oversample then skip already-filled / no-thumb

let done = 0;
for (const file of files) {
  if (done >= limit) break;
  const path = join(POSTS, file);
  const raw = readFileSync(path, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) continue;
  const fm = m[1];
  const body = m[2];
  if (!force && /mediaStyle:/.test(fm)) continue;
  const thumb = fmField(fm, "thumbnail");
  const headline = fmField(fm, "headline") || file;
  if (!thumb) {
    // No art → text presentation
    const next = upsertFm(fm, {
      mediaStyle: "text",
      thumbFocusX: 50,
      thumbFocusY: 50,
      mediaNote: "no thumbnail",
    });
    if (!dry) writeFileSync(path, `---\n${next}\n---\n${body}`);
    console.log(`text  ${file} (no thumb)`);
    done++;
    continue;
  }

  process.stdout.write(`vision ${file} … `);
  let presentation;
  try {
    presentation = await analyze(apiKey, thumb, headline);
  } catch (e) {
    console.log(`FAIL ${(e?.message || e).toString().slice(0, 120)}`);
    continue;
  }
  const next = upsertFm(fm, presentation);
  if (!dry) writeFileSync(path, `---\n${next}\n---\n${body}`);
  console.log(
    `${presentation.mediaStyle} focus=${presentation.thumbFocusX},${presentation.thumbFocusY} — ${presentation.mediaNote || ""}`
  );
  done++;
  // light rate limit
  await sleep(350);
}

console.log(`done ${done} posts${dry ? " (dry)" : ""}`);

function fmField(fm, key) {
  const re = new RegExp(`^${key}:\\s*(?:"((?:\\\\.|[^"\\\\])*)"|([^\\n]+))`, "m");
  const m = fm.match(re);
  if (!m) return null;
  if (m[1] != null) return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return m[2]?.trim().replace(/^"|"$/g, "") ?? null;
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
    else {
      // Insert after thumbnail if present, else end of fm
      if (/^thumbnail:/m.test(out)) {
        out = out.replace(/^(thumbnail:.*)$/m, `$1\n${line}`);
      } else {
        out = out + "\n" + line;
      }
    }
  }
  return out;
}

async function analyze(apiKey, imageUrl, headline) {
  const system = `You are the photo editor for Clad, a news report-card site.
You choose how ONE video still should appear as a mobile feed card.

Card layout context:
- Portrait-ish tile (~3:4 on phones), image fills the card, headline sits in the BOTTOM third over a dark scrim.
- object-fit: cover crops aggressively — the focus point is the only part that stays reliably visible.
- Bad crops zoom on tickers, lower-thirds, empty sky, network bugs, or the wrong half of a split screen.

Return ONLY JSON (no markdown) matching:
{
  "mediaStyle": "overlay" | "modular" | "text",
  "thumbFocusX": number,
  "thumbFocusY": number,
  "mediaNote": string
}

Style rules:
- "overlay" — strong photo subject (face, scene, event).
- "modular" — still usable as top thumb but BAD for full-bleed overlay (dense chyron, split screen, heavy graphics).
- "text" — still useless as art (logo card, pure text, black frame).

Focus rules:
- Anchor on primary face or main action, not logos/tickers.
- Talking heads: ~40–55 X and ~18–35 Y.
- Avoid bottom 35% (covered by text scrim on overlay).`;

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0.15,
      max_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            {
              type: "text",
              text: `Headline: ${headline}\nPick presentation + focus for the attached still.`,
            },
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
  const raw = data?.choices?.[0]?.message?.content;
  const p = JSON.parse(raw);
  const styles = new Set(["overlay", "modular", "text"]);
  const style = styles.has(String(p.mediaStyle || "").toLowerCase())
    ? String(p.mediaStyle).toLowerCase()
    : "overlay";
  const clamp = (n, fb) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : fb;
  };
  return {
    mediaStyle: style,
    thumbFocusX: clamp(p.thumbFocusX, 50),
    thumbFocusY: clamp(p.thumbFocusY, 28),
    mediaNote: String(p.mediaNote || "").slice(0, 200),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
