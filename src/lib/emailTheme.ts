/**
 * Soft Neutral tokens for transactional / digest / newsletter HTML.
 * Matches the site light palette (emails stay light for deliverability).
 */
export const EMAIL = {
  site: "https://cladfacts.com",
  paper: "#F7F5F0",
  card: "#FFFFFF",
  ink: "#1C1C1E",
  muted: "#6B6B6B",
  accent: "#5B9A8B",
  accentSoft: "#E8F3F0",
  rule: "#E5E1D8",
  body: "#3A3A3C",
  /** Web-safe stack approximating SF / system UI */
  font: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  gradeABg: "#D1FAE5",
  gradeAInk: "#065F46",
  gradeBBg: "#FEF3C7",
  gradeBInk: "#92400E",
  gradeCBg: "#FEF3C7",
  gradeCInk: "#92400E",
  gradeBadBg: "#FFE4E6",
  gradeBadInk: "#9F1239",
  leanLeft: "#3B82F6",
  leanRight: "#EF4444",
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
  const { paper, card, ink, muted, accent, rule, font } = EMAIL;
  const cta =
    opts.ctaHref && opts.ctaLabel
      ? `<tr><td style="padding:8px 28px 24px;text-align:center">
      <a href="${opts.ctaHref}" style="display:inline-block;background:${accent};color:#fff;font:600 14px ${font};text-decoration:none;padding:12px 22px;border-radius:999px">${opts.ctaLabel}</a>
    </td></tr>`
      : "";
  return `<!doctype html><html><body style="margin:0;background:${paper};padding:28px 14px;font-family:${font}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:${card};border:1px solid ${rule};border-radius:18px;overflow:hidden">
    <tr><td style="padding:24px 28px 16px;text-align:center;background:${card};border-bottom:1px solid ${rule}">
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
    <tr><td style="padding:16px 28px;border-top:1px solid ${rule};font:12px ${font};color:${muted};text-align:center;line-height:1.5;background:${paper}">
      ${opts.footerNote}
      <br>© ${new Date().getUTCFullYear()} CladFacts LLC
    </td></tr>
  </table></body></html>`;
}
