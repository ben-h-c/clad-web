/**
 * Soft Neutral DARK tokens for digest / newsletter HTML.
 * Matches the site data-theme=dark palette (soft charcoal, elevated cards, teal).
 */
export const EMAIL = {
  site: "https://cladfacts.com",
  paper: "#1C1C1E",
  card: "#2C2C2E",
  ink: "#F5F5F7",
  muted: "#A1A1A6",
  accent: "#6FB5A4",
  accentSoft: "#243834",
  rule: "#3A3A3C",
  body: "#D1D1D6",
  ctaText: "#0E1512",
  /** Web-safe stack approximating SF / system UI */
  font: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  // Dark-mode grade pills: soft fills, light readable ink
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

export function escHtml(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

/** Soft pastel grade pill for email (inline styles only). */
export function gradePill(letter: string): string {
  const t = (letter || "").charAt(0).toUpperCase();
  let bg = EMAIL.gradeCBg;
  let ink = EMAIL.gradeCInk;
  if (t === "A") {
    bg = EMAIL.gradeABg;
    ink = EMAIL.gradeAInk;
  } else if (t === "B") {
    bg = EMAIL.gradeBBg;
    ink = EMAIL.gradeBInk;
  } else if (t === "D" || t === "F") {
    bg = EMAIL.gradeBadBg;
    ink = EMAIL.gradeBadInk;
  }
  return `<span style="display:inline-block;font:700 12px ${EMAIL.font};color:${ink};background:${bg};border-radius:999px;padding:3px 10px;letter-spacing:0.02em">${escHtml(letter)}</span>`;
}

export function emailShell(opts: {
  title: string;
  subtitle?: string;
  body: string;
  footerNote: string;
  ctaHref?: string;
  ctaLabel?: string;
}): string {
  const { paper, card, ink, muted, accent, rule, font, ctaText } = EMAIL;
  const cta =
    opts.ctaHref && opts.ctaLabel
      ? `<tr><td style="padding:8px 28px 24px;text-align:center;background:${card}">
      <a href="${opts.ctaHref}" style="display:inline-block;background:${accent};color:${ctaText};font:600 14px ${font};text-decoration:none;padding:12px 22px;border-radius:999px">${opts.ctaLabel}</a>
    </td></tr>`
      : "";
  // color-scheme + meta color-scheme help Apple Mail / iOS respect dark chrome.
  return `<!doctype html><html lang="en" style="color-scheme:dark;background:${paper}"><head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
</head><body style="margin:0;background:${paper};padding:28px 14px;font-family:${font};color:${ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${paper}" style="background:${paper}">
  <tr><td align="center" style="background:${paper}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${card}" style="max-width:600px;margin:0 auto;background:${card};border:1px solid ${rule};border-radius:18px;overflow:hidden">
    <tr><td bgcolor="${card}" style="padding:24px 28px 16px;text-align:center;background:${card};border-bottom:1px solid ${rule}">
      <div style="font:700 26px ${font};letter-spacing:-0.02em;color:${ink}">CladFacts</div>
      ${
        opts.subtitle
          ? `<div style="font:600 12px ${font};letter-spacing:0.06em;color:${accent};text-transform:uppercase;margin-top:8px">${opts.subtitle}</div>`
          : ""
      }
      ${opts.title ? `<div style="font:500 14px ${font};color:${muted};margin-top:6px">${opts.title}</div>` : ""}
    </td></tr>
    ${opts.body}
    ${cta}
    <tr><td bgcolor="${paper}" style="padding:16px 28px;border-top:1px solid ${rule};font:12px ${font};color:${muted};text-align:center;line-height:1.5;background:${paper}">
      ${opts.footerNote}
      <br>© ${new Date().getUTCFullYear()} CladFacts LLC
    </td></tr>
  </table>
  </td></tr></table>
</body></html>`;
}
