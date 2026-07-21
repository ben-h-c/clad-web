/**
 * Weekly newsletter — an editorial "week in review" sent to everyone who opts
 * in (same content for all, unlike the personalized digest). Soft Neutral email
 * chrome matches the site redesign.
 */
import type { CollectionEntry } from "astro:content";
import { gradeToGpa, gpaToGrade, leanScoreOf } from "./topics.ts";
import { EMAIL, emailShell, escHtml, gradePill } from "./emailTheme.ts";

const SITE = EMAIL.site;
const { ink, muted, accent, rule, font, body, accentSoft } = EMAIL;
const WEEK = 7 * 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Post = CollectionEntry<"posts">;

export interface NewsletterResult {
  subject: string;
  html: string;
  count: number;
}

function leanLabel(s: number | null): string | null {
  if (s == null) return null;
  return Math.abs(s) < 5 ? "Centered" : `${Math.abs(s)}% ${s > 0 ? "Right" : "Left"}-leaning`;
}
function thumbUrl(d: Post["data"]): string | null {
  if (d.thumbnail) return d.thumbnail.startsWith("/") ? SITE + d.thumbnail : d.thumbnail;
  if (d.videoId) return `https://img.youtube.com/vi/${d.videoId}/hqdefault.jpg`;
  return null;
}
function fmtDay(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function storyRow(p: Post, showGrades: boolean): string {
  const d = p.data;
  const url = `${SITE}/posts/${p.id}/`;
  const thumb = thumbUrl(d);
  const meta = [d.sourceTitle ?? "", fmtDay(d.publishedAt)].filter(Boolean).join(" · ");
  let score = "";
  if (showGrades) {
    const lean = leanLabel(leanScoreOf(d));
    const bits = [
      d.letterGrade ? gradePill(d.letterGrade) : null,
      lean ? `<span style="font:600 13px ${font};color:${muted}">${escHtml(lean)}</span>` : null,
    ].filter(Boolean);
    if (bits.length) {
      score = `<div style="margin:6px 0 4px;line-height:1.6">${bits.join(" &nbsp; ")}</div>`;
    }
  }
  const thumbCell = thumb
    ? `<td width="128" valign="top" style="padding-right:14px"><a href="${url}"><img src="${escHtml(thumb)}" width="128" height="72" alt="" style="display:block;width:128px;height:72px;object-fit:cover;border:0;border-radius:10px"></a></td>`
    : "";
  return `<tr><td style="padding:14px 0;border-bottom:1px solid ${rule}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${thumbCell}
    <td valign="top">
      <a href="${url}" style="font:700 16px ${font};color:${ink};text-decoration:none;line-height:1.3">${escHtml(d.headline)}</a>
      <div style="font:12px ${font};color:${muted};margin:4px 0">${escHtml(meta)}</div>
      ${score}
      <div style="font:13px ${font};color:${body};line-height:1.5">${escHtml((d.summary || "").slice(0, 150))}…</div>
    </td></tr></table></td></tr>`;
}

function gradeLine(p: Post): string {
  const d = p.data;
  return `<tr><td style="padding:8px 0;font:14px ${font};color:${ink};line-height:1.4">
    ${d.letterGrade ? gradePill(d.letterGrade) + " " : ""}
    <a href="${SITE}/posts/${p.id}/" style="color:${ink};text-decoration:none;font-weight:600">${escHtml(d.headline)}</a>
    <span style="color:${muted}"> — ${escHtml(d.sourceTitle ?? "")}</span>
  </td></tr>`;
}

function section(title: string, inner: string): string {
  return `<tr><td style="padding:20px 28px 0">
    <h2 style="font:700 12px ${font};letter-spacing:.08em;text-transform:uppercase;color:${accent};margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid ${rule}">${title}</h2>
    ${inner}
  </td></tr>`;
}

export function buildNewsletter(opts: { posts: Post[]; showGrades: boolean; max?: number }): NewsletterResult | null {
  const now = Date.now();
  const since = now - WEEK;
  const fresh = opts.posts.filter((p) => p.data.publishedAt.valueOf() >= since);
  if (fresh.length === 0) return null;

  const byNew = [...fresh].sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
  const top = byNew.slice(0, opts.max ?? 5);

  const gpas = fresh.map((p) => gradeToGpa(p.data.letterGrade)).filter((n): n is number => n != null);
  const leans = fresh.map((p) => leanScoreOf(p.data)).filter((n): n is number => n != null);
  const avgGrade = gpas.length ? gpaToGrade(gpas.reduce((a, b) => a + b, 0) / gpas.length) : null;
  let left = 0,
    center = 0,
    right = 0;
  for (const l of leans) (l <= -8 ? left++ : l >= 8 ? right++ : center++);

  const graded = fresh.filter((p) => gradeToGpa(p.data.letterGrade) != null);
  const best = [...graded]
    .sort((a, b) => gradeToGpa(b.data.letterGrade)! - gradeToGpa(a.data.letterGrade)!)
    .slice(0, 3);
  const bestIds = new Set(best.map((p) => p.id));
  const worst = [...graded]
    .filter((p) => !bestIds.has(p.id))
    .sort((a, b) => gradeToGpa(a.data.letterGrade)! - gradeToGpa(b.data.letterGrade)!)
    .slice(0, 3);
  const leaned = fresh.filter((p) => leanScoreOf(p.data) != null);
  const mostLeft = [...leaned].sort((a, b) => leanScoreOf(a.data)! - leanScoreOf(b.data)!)[0];
  const mostRight = [...leaned].sort((a, b) => leanScoreOf(b.data)! - leanScoreOf(a.data)!)[0];

  const rangeStart = fmtDay(new Date(since));
  const rangeEnd = fmtDay(new Date(now));

  const sections: string[] = [];

  if (opts.showGrades) {
    sections.push(
      section(
        "The week in numbers",
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr style="text-align:center">
          <td style="padding:10px 6px;background:${accentSoft};border-radius:12px">
            <div style="font:700 24px ${font};color:${ink}">${fresh.length}</div>
            <div style="font:600 11px ${font};color:${muted};text-transform:uppercase;letter-spacing:0.04em">reports</div>
          </td>
          <td width="10"></td>
          <td style="padding:10px 6px;background:${accentSoft};border-radius:12px">
            <div style="font:700 24px ${font};color:${ink}">${escHtml(avgGrade ?? "—")}</div>
            <div style="font:600 11px ${font};color:${muted};text-transform:uppercase;letter-spacing:0.04em">avg grade</div>
          </td>
          <td width="10"></td>
          <td style="padding:10px 6px;background:${accentSoft};border-radius:12px">
            <div style="font:700 16px ${font};color:${ink}">${left} · ${center} · ${right}</div>
            <div style="font:600 11px ${font};color:${muted};text-transform:uppercase;letter-spacing:0.04em">L · C · R</div>
          </td>
        </tr></table>`
      )
    );
  } else {
    sections.push(
      section(
        "This week",
        `<p style="font:14px ${font};color:${body};margin:0">We fact-checked <strong>${fresh.length}</strong> news reports this week.</p>`
      )
    );
  }

  sections.push(
    section(
      "Top stories",
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${top.map((p) => storyRow(p, opts.showGrades)).join("")}</table>`
    )
  );

  if (opts.showGrades) {
    if (best.length) {
      sections.push(
        section(
          "Top of the class",
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${best.map(gradeLine).join("")}</table>`
        )
      );
    }
    if (worst.length) {
      sections.push(
        section(
          "Bottom of the barrel",
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${worst.map(gradeLine).join("")}</table>`
        )
      );
    }
    if (mostLeft || mostRight) {
      const rows = [
        mostLeft
          ? `<tr><td style="padding:8px 0;font:14px ${font}"><span style="color:${EMAIL.leanLeft};font-weight:700">◀ Most left</span> — <a href="${SITE}/posts/${mostLeft.id}/" style="color:${ink};text-decoration:none;font-weight:600">${escHtml(mostLeft.data.headline)}</a> <span style="color:${muted}">(${escHtml(leanLabel(leanScoreOf(mostLeft.data)) ?? "")})</span></td></tr>`
          : "",
        mostRight
          ? `<tr><td style="padding:8px 0;font:14px ${font}"><span style="color:${EMAIL.leanRight};font-weight:700">Most right ▶</span> — <a href="${SITE}/posts/${mostRight.id}/" style="color:${ink};text-decoration:none;font-weight:600">${escHtml(mostRight.data.headline)}</a> <span style="color:${muted}">(${escHtml(leanLabel(leanScoreOf(mostRight.data)) ?? "")})</span></td></tr>`
          : "",
      ].join("");
      sections.push(
        section("Most biased coverage", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`)
      );
    }
  } else {
    sections.push(
      section(
        "Grades, swings &amp; bias",
        `<p style="font:14px ${font};color:${body};line-height:1.55;margin:0 0 12px">The week's best- and worst-graded coverage and the most politically biased reports unlock with a <strong>free CladFacts account</strong> — no card, no trial clock.</p>
         <a href="${SITE}/register/" style="display:inline-block;background:${accent};color:#fff;font:600 14px ${font};text-decoration:none;padding:11px 20px;border-radius:999px">Unlock this week's grades — free →</a>`
      )
    );
  }

  const html = emailShell({
    title: `${rangeStart}–${rangeEnd}`,
    subtitle: "The Weekly Review",
    body: sections.join(""),
    ctaHref: `${SITE}/`,
    ctaLabel: "Read CladFacts →",
    footerNote: `You're receiving the CladFacts weekly newsletter.
      <a href="${SITE}/account/" style="color:${muted}">Manage your email preferences</a>.
      <br><a href="${SITE}/week/" style="color:${accent}">This week on the site: The Week in Grades →</a>`,
  });

  return { subject: `CladFacts Weekly — ${rangeStart}–${rangeEnd}`, html, count: top.length };
}
