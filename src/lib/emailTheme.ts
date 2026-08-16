/**
 * Soft Neutral DARK email chrome — same tokens as the app (data-theme=dark).
 * Cards are 16:9 report tiles on charcoal paper, not a single text dump.
 */
import { dateline as siteDateline, shortDate } from "./dateline.ts";
import { displayableThumb } from "./imagePolicy.ts";
import { leanScoreOf } from "./topics.ts";

export const EMAIL = {
  site: "https://cladfacts.com",
  paper: "#1C1C1E",
  paperDeep: "#161618",
  card: "#2C2C2E",
  ink: "#F5F5F7",
  muted: "#A1A1A6",
  accent: "#6FB5A4",
  accentSoft: "#243834",
  rule: "#3A3A3C",
  body: "#D1D1D6",
  ctaText: "#0E1512",
  font: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  gradeABg: "#1F4A3A",
  gradeAInk: "#A7F3D0",
  gradeBBg: "#4A3818",
  gradeBInk: "#FDE68A",
  gradeCBg: "#4A3818",
  gradeCInk: "#FDE68A",
  gradeBadBg: "#4A1F2A",
  gradeBadInk: "#FECDD3",
  leanLeft: "#60A5FA",
  leanRight: "#F87171",
} as const;

const SITE = EMAIL.site;
const { paper, paperDeep, card, ink, muted, accent, rule, body, font, ctaText } = EMAIL;

export function escHtml(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

export function gradePill(letter: string): string {
  const t = (letter || "").charAt(0).toUpperCase();
  let bg = EMAIL.gradeCBg;
  let inkC = EMAIL.gradeCInk;
  if (t === "A") {
    bg = EMAIL.gradeABg;
    inkC = EMAIL.gradeAInk;
  } else if (t === "B") {
    bg = EMAIL.gradeBBg;
    inkC = EMAIL.gradeBInk;
  } else if (t === "D" || t === "F") {
    bg = EMAIL.gradeBadBg;
    inkC = EMAIL.gradeBadInk;
  }
  return `<span style="display:inline-block;font:700 16px/1 ${font};color:${inkC};background:${bg};border-radius:999px;min-width:36px;padding:8px 10px;text-align:center;letter-spacing:0.01em">${escHtml(letter)}</span>`;
}

export function leanChip(score: number | null): string {
  if (score == null) return "";
  const abs = Math.abs(score);
  const label = abs < 5 ? "Centered" : `${abs}% ${score > 0 ? "Right" : "Left"}`;
  const color = abs < 5 ? muted : score > 0 ? EMAIL.leanRight : EMAIL.leanLeft;
  return `<span style="font:600 13px ${font};color:${color};letter-spacing:0.01em">${escHtml(label)}</span>`;
}

export function emailThumb(d: {
  thumbnail?: string | null;
  videoId?: string | null;
}): string | null {
  const raw = displayableThumb(d.thumbnail ?? null);
  if (raw) return raw.startsWith("/") ? SITE + raw : raw;
  if (d.videoId) return `https://img.youtube.com/vi/${d.videoId}/hqdefault.jpg`;
  return null;
}

export function emailSectionHead(title: string): string {
  return `<tr><td style="padding:22px 4px 10px">
    <div style="font:700 11px ${font};letter-spacing:0.12em;text-transform:uppercase;color:${accent}">${title}</div>
  </td></tr>`;
}

/** App report card: 16:9 still + outlet/date + headline + grade/lean. */
export function emailStoryCard(opts: {
  href: string;
  headline: string;
  source?: string | null;
  publishedAt?: Date;
  thumbnail?: string | null;
  videoId?: string | null;
  letterGrade?: string | null;
  leanScore?: number | null;
  showGrades?: boolean;
  blurb?: string | null;
}): string {
  const url = opts.href;
  const thumb = emailThumb(opts);
  const meta = [opts.source || "", opts.publishedAt ? shortDate(opts.publishedAt) : ""]
    .filter(Boolean)
    .join(" · ");
  const media = thumb
    ? `<tr><td style="font-size:0;line-height:0">
        <a href="${url}" style="display:block">
          <img src="${escHtml(thumb)}" width="552" alt="" style="display:block;width:100%;max-width:552px;height:auto;border:0">
        </a>
      </td></tr>`
    : "";
  let score = "";
  if (opts.showGrades !== false && (opts.letterGrade || opts.leanScore != null)) {
    score = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 0"><tr>
      ${opts.letterGrade ? `<td style="padding:0 10px 0 0;vertical-align:middle">${gradePill(opts.letterGrade)}</td>` : ""}
      ${opts.leanScore != null ? `<td style="vertical-align:middle">${leanChip(opts.leanScore)}</td>` : ""}
    </tr></table>`;
  }
  const blurb =
    opts.blurb && opts.blurb.trim()
      ? `<div style="font:14px/1.5 ${font};color:${body};margin:10px 0 0">${escHtml(opts.blurb.trim())}</div>`
      : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${card}" style="background:${card};border-radius:18px;overflow:hidden;border:1px solid ${rule}">
    ${media}
    <tr><td bgcolor="${card}" style="padding:16px 18px 18px;background:${card}">
      ${meta ? `<div style="font:700 11px ${font};letter-spacing:0.08em;text-transform:uppercase;color:${muted};margin:0 0 8px">${escHtml(meta)}</div>` : ""}
      <a href="${url}" style="font:700 20px/1.28 ${font};color:${ink};text-decoration:none">${escHtml(opts.headline)}</a>
      ${score}
      ${blurb}
    </td></tr>
  </table>`;
}

export function emailStoryFromPost(
  p: {
    id: string;
    data: {
      headline: string;
      summary?: string;
      sourceTitle?: string | null;
      publishedAt: Date;
      thumbnail?: string | null;
      videoId?: string | null;
      letterGrade?: string | null;
      leanScore?: number | null;
      politicalLean?: string | null;
    };
  },
  showGrades: boolean,
  opts?: { blurb?: boolean }
): string {
  const d = p.data;
  return emailStoryCard({
    href: `${SITE}/posts/${p.id}/`,
    headline: d.headline,
    source: d.sourceTitle,
    publishedAt: d.publishedAt,
    thumbnail: d.thumbnail,
    videoId: d.videoId,
    letterGrade: showGrades ? d.letterGrade ?? null : null,
    leanScore: showGrades ? leanScoreOf(d as Parameters<typeof leanScoreOf>[0]) : null,
    showGrades,
    blurb: opts?.blurb === false ? null : (d.summary || "").replace(/\s+/g, " ").trim().slice(0, 140),
  });
}

export function emailShell(opts: {
  title: string;
  subtitle?: string;
  body: string;
  footerNote: string;
  ctaHref?: string;
  ctaLabel?: string;
  previewText?: string;
}): string {
  const cta =
    opts.ctaHref && opts.ctaLabel
      ? `<tr><td style="padding:8px 0 20px;text-align:center">
      <a href="${opts.ctaHref}" style="display:inline-block;background:${accent};color:${ctaText};font:600 14px ${font};text-decoration:none;padding:12px 22px;border-radius:999px">${opts.ctaLabel}</a>
    </td></tr>`
      : "";
  const kicker = opts.subtitle
    ? `<div style="font:700 11px ${font};letter-spacing:0.14em;text-transform:uppercase;color:${accent};margin:8px 0 0">${opts.subtitle}</div>`
    : "";
  const datelineLine = opts.title
    ? `<div style="font:400 13px ${font};color:${muted};margin:6px 0 0">${opts.title}</div>`
    : "";
  const preview = opts.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escHtml(opts.previewText)}</div>`
    : "";
  return `<!doctype html><html lang="en" style="color-scheme:dark;background:${paper}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>CladFacts</title>
</head>
<body style="margin:0;background:${paper};padding:0;font-family:${font};color:${ink}">
${preview}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${paper}" style="background:${paper}">
<tr><td align="center" style="background:${paper};padding:20px 12px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto">
  <tr><td style="padding:8px 8px 20px">
    <a href="${SITE}/" style="font:800 22px ${font};letter-spacing:0.14em;color:${ink};text-decoration:none">CLAD</a>
    ${kicker}
    ${datelineLine}
  </td></tr>
  ${opts.body}
  ${cta}
  <tr><td style="padding:8px 8px 0;font:12px/1.55 ${font};color:${muted};text-align:center">
    ${opts.footerNote}
    <br>© ${new Date().getUTCFullYear()} CladFacts LLC
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export function emailPageDateline(when: Date = new Date()): string {
  return siteDateline(when);
}
