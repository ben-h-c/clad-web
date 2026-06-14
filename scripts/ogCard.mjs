/**
 * Renders a 1200x630 social-preview card (PNG) that mirrors how an article
 * looks on the site: thumbnail, letter grade, political lean, headline, in the
 * broadsheet style. Runs in plain Node at build time (see genOgImages.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import { html } from "satori-html";
import { initWasm, Resvg } from "@resvg/resvg-wasm";

const PAPER = "#F5EDD9";
const INK = "#1A140D";
const MUTED = "#6E5E4D";
const RED = "#941A1A";

const cwd = process.cwd();

let fontsCache = null;
function getFonts() {
  if (fontsCache) return fontsCache;
  const dir = path.join(cwd, "node_modules/@fontsource/playfair-display/files");
  fontsCache = [
    { name: "Playfair", data: fs.readFileSync(path.join(dir, "playfair-display-latin-400-normal.woff")), weight: 400, style: "normal" },
    { name: "Playfair", data: fs.readFileSync(path.join(dir, "playfair-display-latin-700-normal.woff")), weight: 700, style: "normal" },
  ];
  return fontsCache;
}

let wasmReady = null;
function ensureWasm() {
  if (!wasmReady) {
    wasmReady = initWasm(fs.readFileSync(path.join(cwd, "node_modules/@resvg/resvg-wasm/index_bg.wasm")));
  }
  return wasmReady;
}

function gradeColor(badge) {
  const t = (badge || "").charAt(0).toUpperCase();
  if (t === "A" || t === "B") return INK;
  if (t === "C") return MUTED;
  return RED;
}

// satori-html does NOT decode HTML entities, so keep "&" literal and only
// neutralize angle brackets that would otherwise break tag parsing.
const esc = (s) => String(s ?? "").replace(/</g, " ").replace(/>/g, " ");

async function loadThumb(thumbnail) {
  if (!thumbnail) return null;
  try {
    if (/^https?:\/\//.test(thumbnail)) {
      const r = await fetch(thumbnail);
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      const mime = thumbnail.endsWith(".png") ? "image/png" : "image/jpeg";
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
    const file = path.join(cwd, "public", thumbnail.replace(/^\//, ""));
    if (fs.existsSync(file)) {
      const mime = file.endsWith(".png") ? "image/png" : "image/jpeg";
      return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
    }
  } catch {
    /* fall through to no-thumb fallback */
  }
  return null;
}

export async function renderOgCard(input) {
  await ensureWasm();
  const thumb = await loadThumb(input.thumbnail);
  const color = gradeColor(input.badge);

  const meta = [input.lean ? "POLITICAL LEAN" : null, input.factuality != null ? `FACTUALITY ${input.factuality}/100` : null]
    .filter(Boolean)
    .join("    ·    ");

  const thumbBlock = thumb
    ? `<img src="${thumb}" style="width:1200px;height:286px;object-fit:cover;" />`
    : `<div style="display:flex;width:1200px;height:286px;background:${INK};"></div>`;

  const leanBlock = input.lean
    ? `<div style="display:flex;flex-direction:column;">
         <div style="display:flex;font-size:40px;font-weight:700;">${esc(input.lean)}</div>
         <div style="display:flex;font-size:18px;color:${MUTED};letter-spacing:3px;margin-top:6px;">${esc(meta)}</div>
       </div>`
    : meta
      ? `<div style="display:flex;font-size:20px;color:${MUTED};letter-spacing:3px;">${esc(meta)}</div>`
      : `<div style="display:flex;"></div>`;

  const markup = html(`
  <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${PAPER};color:${INK};font-family:Playfair;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 44px;height:70px;border-bottom:4px solid ${INK};">
      <div style="display:flex;font-size:40px;font-weight:700;letter-spacing:8px;">CLAD</div>
      <div style="display:flex;font-size:20px;color:${MUTED};letter-spacing:2px;">GRADING CONTENT & EXPOSING BIAS</div>
    </div>
    <div style="display:flex;width:1200px;height:286px;border-bottom:1px solid ${INK};">
      ${thumbBlock}
    </div>
    <div style="display:flex;flex-direction:column;flex:1;padding:26px 44px;justify-content:space-between;">
      <div style="display:flex;align-items:center;">
        <div style="display:flex;flex-direction:column;align-items:center;margin-right:34px;">
          <div style="display:flex;font-size:92px;font-weight:700;line-height:1;color:${color};">${esc(input.badge)}</div>
          <div style="display:flex;font-size:18px;color:${MUTED};letter-spacing:3px;margin-top:6px;">${esc(input.badgeLabel)}</div>
        </div>
        <div style="display:flex;width:1px;height:96px;background:${INK};margin-right:34px;"></div>
        ${leanBlock}
      </div>
      <div style="display:flex;font-size:38px;font-weight:700;line-height:1.12;">${esc(input.headline)}</div>
    </div>
  </div>`);

  const svg = await satori(markup, { width: 1200, height: 630, fonts: getFonts() });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}
