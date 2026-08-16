/**
 * Soft Neutral DARK email chrome — same tokens as the app (data-theme=dark).
 *
 * Email clients parse HTML attributes strictly. Never put double quotes inside
 * a style="" value (a quoted font name like "Segoe UI" splits the attribute,
 * drops styles, and can drop the href). Font stack is quote-free on purpose.
 */
import { dateline as siteDateline, shortDate } from "./dateline.ts";
import { displayableThumb } from "./imagePolicy.ts";
import { leanScoreOf } from "./topics.ts";
import { thumbnailUrl } from "./youtube.ts";

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
  // Quote-free — quoted family names break style="..." in every mail client.
  font: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif",
  gradeABg: "#065F46",
  gradeAInk: "#A7F3D0",
  gradeBBg: "#92400E",
  gradeBInk: "#FDE68A",
  gradeCBg: "#78350F",
  gradeCInk: "#FDE68A",
  gradeBadBg: "#9F1239",
  gradeBadInk: "#FECDD3",
  leanLeft: "#60A5FA",
  leanRight: "#F87171",
} as const;

const SITE = EMAIL.site;
const { paper, paperDeep, card, ink, muted, accent, rule, body, font, ctaText } = EMAIL;

export function escHtml(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

export function escAttr(s: string): string {
  return escHtml(s);
}

/** Absolute article URL. Always https, always /posts/{id}/. */
export function postHref(id: string): string {
  const slug = String(id || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  return `${SITE}/posts/${slug}/`;
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
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;border-collapse:separate"><tr>
    <td bgcolor="${bg}" style="background:${bg};color:${inkC};font-family:${font};font-size:15px;font-weight:700;line-height:1;padding:7px 10px;border-radius:999px;text-align:center">${escHtml(letter)}</td>
  </tr></table>`;
}

export function leanChip(score: number | null): string {
  if (score == null) return "";
  const abs = Math.abs(score);
  const label = abs < 5 ? "Centered" : `${abs}% ${score > 0 ? "Right" : "Left"}`;
  const color = abs < 5 ? muted : score > 0 ? EMAIL.leanRight : EMAIL.leanLeft;
  return `<span style="font-family:${font};font-size:13px;font-weight:600;color:${color};letter-spacing:0.01em">${escHtml(label)}</span>`;
}

export function emailThumb(d: {
  thumbnail?: string | null;
  videoId?: string | null;
}): string | null {
  const raw = displayableThumb(d.thumbnail ?? null);
  if (raw) return raw.startsWith("/") ? SITE + raw : raw;
  if (d.videoId) return thumbnailUrl(d.videoId);
  return null;
}

export function emailSectionHead(title: string): string {
  return `<tr><td style="padding:22px 4px 10px">
    <div style="font-family:${font};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${accent}">${escHtml(title)}</div>
  </td></tr>`;
}

/** Solid-fill button. bgcolor on the td so it still paints when CSS is stripped. */
export function emailButton(href: string, label: string, align: "left" | "center" = "left"): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="${align}" style="margin:14px 0 0">
    <tr>
      <td bgcolor="${accent}" style="background:${accent};border-radius:999px">
        <a href="${escAttr(href)}" target="_blank" style="display:inline-block;padding:12px 18px;font-family:${font};font-size:14px;font-weight:700;line-height:1;color:${ctaText};text-decoration:none">${escHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

/** App report card: 16:9 still + grade/lean + headline + Open report. */
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
  const safeUrl = escAttr(url);
  const thumb = emailThumb(opts);
  const meta = [opts.publishedAt ? shortDate(opts.publishedAt) : "", opts.source || ""]
    .filter(Boolean)
    .join(" · ");
  const media = thumb
    ? `<tr><td bgcolor="${paperDeep}" style="font-size:0;line-height:0;background:${paperDeep}">
        <a href="${safeUrl}" target="_blank" style="display:block;text-decoration:none">
          <img src="${escAttr(thumb)}" width="600" alt="${escAttr(opts.headline)}" style="display:block;width:100%;max-width:600px;height:auto;border:0">
        </a>
      </td></tr>`
    : "";

  let chips = "";
  if (opts.showGrades !== false && (opts.letterGrade || opts.leanScore != null)) {
    chips = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px"><tr>
      ${opts.letterGrade ? `<td style="padding:0 10px 0 0;vertical-align:middle">${gradePill(opts.letterGrade)}</td>` : ""}
      ${opts.leanScore != null ? `<td style="vertical-align:middle">${leanChip(opts.leanScore)}</td>` : ""}
    </tr></table>`;
  }

  const blurb =
    opts.blurb && opts.blurb.trim()
      ? `<div style="font-family:${font};font-size:15px;line-height:1.5;color:${body};margin:10px 0 0">${escHtml(opts.blurb.trim())}</div>`
      : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${card}" style="background:${card};border-radius:18px;overflow:hidden;border:1px solid ${rule}">
    ${media}
    <tr><td bgcolor="${card}" style="padding:16px 18px 18px;background:${card}">
      ${chips}
      <a href="${safeUrl}" target="_blank" style="font-family:${font};font-size:20px;font-weight:700;line-height:1.28;color:${ink};text-decoration:none">${escHtml(opts.headline)}</a>
      ${meta ? `<div style="font-family:${font};font-size:13px;font-style:italic;color:${muted};margin:8px 0 0">${escHtml(meta)}</div>` : ""}
      ${blurb}
      ${emailButton(url, "Open report")}
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
    href: postHref(p.id),
    headline: d.headline,
    source: d.sourceTitle,
    publishedAt: d.publishedAt,
    thumbnail: d.thumbnail,
    videoId: d.videoId,
    letterGrade: showGrades ? d.letterGrade ?? null : null,
    leanScore: showGrades ? leanScoreOf(d as Parameters<typeof leanScoreOf>[0]) : null,
    showGrades,
    blurb: opts?.blurb === false ? null : (d.summary || "").replace(/\s+/g, " ").trim().slice(0, 160),
  });
}

export function emailShell(opts: {
  title?: string;
  subtitle?: string;
  body: string;
  footerNote: string;
  ctaHref?: string;
  ctaLabel?: string;
  previewText?: string;
  /** CLAD wordmark + kicker. Off for the welcome letter. */
  brand?: boolean;
}): string {
  const showBrand = opts.brand !== false;
  const cta =
    opts.ctaHref && opts.ctaLabel
      ? `<tr><td style="padding:8px 0 20px" align="center">${emailButton(opts.ctaHref, opts.ctaLabel, "center")}</td></tr>`
      : "";
  const kicker = opts.subtitle
    ? `<div style="font-family:${font};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${accent};margin:8px 0 0">${escHtml(opts.subtitle)}</div>`
    : "";
  const datelineLine = opts.title
    ? `<div style="font-family:${font};font-size:13px;color:${muted};margin:6px 0 0">${escHtml(opts.title)}</div>`
    : "";
  const header =
    showBrand || opts.subtitle || opts.title
      ? `<tr><td style="padding:8px 8px 20px">
    ${showBrand ? `<a href="${SITE}/" target="_blank" style="font-family:${font};font-size:22px;font-weight:800;letter-spacing:0.16em;color:${ink};text-decoration:none">CLAD</a>` : ""}
    ${kicker}
    ${datelineLine}
  </td></tr>`
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
  ${header}
  ${opts.body}
  ${cta}
  <tr><td style="padding:8px 8px 0;font-family:${font};font-size:12px;line-height:1.55;color:${muted};text-align:center">
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
