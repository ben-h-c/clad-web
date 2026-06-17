/**
 * Weekly newsletter — an editorial "week in review" sent to everyone who opts
 * in (same content for all, unlike the personalized digest). Leads with the
 * week's numbers and top stories, then the signature best/worst grades and
 * most-biased coverage. Subscribers see grades + lean; free readers get the
 * stories plus an upgrade nudge in place of the graded sections.
 */
import type { CollectionEntry } from "astro:content";
import { gradeToGpa, gpaToGrade, leanScoreOf } from "./topics";

const SITE = "https://cladfacts.com";
const INK = "#1a140d";
const MUTED = "#6b6257";
const ACCENT = "rgb(150,30,20)";
const WEEK = 7 * 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Post = CollectionEntry<"posts">;

export interface NewsletterResult {
  subject: string;
  html: string;
  count: number;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
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
    const bits = [d.letterGrade ? `Grade ${esc(d.letterGrade)}` : null, lean ? esc(lean) : null].filter(Boolean);
    if (bits.length) score = `<div style="font:600 13px Georgia,serif;color:${INK};margin:2px 0">${bits.join(" &nbsp;·&nbsp; ")}</div>`;
  }
  const thumbCell = thumb
    ? `<td width="128" valign="top" style="padding-right:12px"><a href="${url}"><img src="${esc(thumb)}" width="128" height="72" alt="" style="display:block;width:128px;height:72px;object-fit:cover;border:1px solid #e6ddcb"></a></td>`
    : "";
  return `<tr><td style="padding:12px 0;border-bottom:1px solid #e6ddcb"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${thumbCell}
    <td valign="top">
      <a href="${url}" style="font:700 17px Georgia,serif;color:${INK};text-decoration:none;line-height:1.25">${esc(d.headline)}</a>
      <div style="font:12px Georgia,serif;color:${MUTED};margin:3px 0">${esc(meta)}</div>
      ${score}
      <div style="font:13px Georgia,serif;color:#333;line-height:1.45">${esc((d.summary || "").slice(0, 150))}…</div>
    </td></tr></table></td></tr>`;
}

function gradeLine(p: Post): string {
  const d = p.data;
  return `<tr><td style="padding:6px 0;font:14px Georgia,serif;color:${INK}">
    <span style="display:inline-block;min-width:2.2em;font:700 14px Georgia,serif;color:${ACCENT}">${esc(d.letterGrade ?? "")}</span>
    <a href="${SITE}/posts/${p.id}/" style="color:${INK};text-decoration:none">${esc(d.headline)}</a>
    <span style="color:${MUTED}"> — ${esc(d.sourceTitle ?? "")}</span>
  </td></tr>`;
}

function section(title: string, inner: string): string {
  return `<tr><td style="padding:18px 26px 0">
    <h2 style="font:700 13px Georgia,serif;letter-spacing:.1em;text-transform:uppercase;color:${ACCENT};border-bottom:2px solid ${INK};padding-bottom:4px;margin:0 0 6px">${title}</h2>
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

  // Week in numbers.
  const gpas = fresh.map((p) => gradeToGpa(p.data.letterGrade)).filter((n): n is number => n != null);
  const leans = fresh.map((p) => leanScoreOf(p.data)).filter((n): n is number => n != null);
  const avgGrade = gpas.length ? gpaToGrade(gpas.reduce((a, b) => a + b, 0) / gpas.length) : null;
  let left = 0, center = 0, right = 0;
  for (const l of leans) (l <= -8 ? left++ : l >= 8 ? right++ : center++);

  // Best & worst graded this week.
  const graded = fresh.filter((p) => gradeToGpa(p.data.letterGrade) != null);
  const best = [...graded].sort((a, b) => gradeToGpa(b.data.letterGrade)! - gradeToGpa(a.data.letterGrade)!).slice(0, 3);
  const bestIds = new Set(best.map((p) => p.id));
  const worst = [...graded]
    .filter((p) => !bestIds.has(p.id))
    .sort((a, b) => gradeToGpa(a.data.letterGrade)! - gradeToGpa(b.data.letterGrade)!)
    .slice(0, 3);
  // Most biased.
  const leaned = fresh.filter((p) => leanScoreOf(p.data) != null);
  const mostLeft = [...leaned].sort((a, b) => leanScoreOf(a.data)! - leanScoreOf(b.data)!)[0];
  const mostRight = [...leaned].sort((a, b) => leanScoreOf(b.data)! - leanScoreOf(a.data)!)[0];

  const rangeStart = fmtDay(new Date(since));
  const rangeEnd = fmtDay(new Date(now));

  const sections: string[] = [];

  // By the numbers
  if (opts.showGrades) {
    sections.push(
      section(
        "The week in numbers",
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr style="text-align:center">
          <td style="padding:6px"><div style="font:700 26px Georgia,serif;color:${INK}">${fresh.length}</div><div style="font:11px Georgia,serif;color:${MUTED};text-transform:uppercase">reports</div></td>
          <td style="padding:6px"><div style="font:700 26px Georgia,serif;color:${INK}">${esc(avgGrade ?? "—")}</div><div style="font:11px Georgia,serif;color:${MUTED};text-transform:uppercase">avg grade</div></td>
          <td style="padding:6px"><div style="font:700 16px Georgia,serif;color:${INK}">${left}·${center}·${right}</div><div style="font:11px Georgia,serif;color:${MUTED};text-transform:uppercase">L · C · R</div></td>
        </tr></table>`
      )
    );
  } else {
    sections.push(
      section(
        "This week",
        `<p style="font:14px Georgia,serif;color:#333;margin:0">We fact-checked <strong>${fresh.length}</strong> news reports this week.</p>`
      )
    );
  }

  // Top stories
  sections.push(section("Top stories", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${top.map((p) => storyRow(p, opts.showGrades)).join("")}</table>`));

  // Grades + bias (subscriber) OR upgrade nudge (free)
  if (opts.showGrades) {
    if (best.length) sections.push(section("Top of the class", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${best.map(gradeLine).join("")}</table>`));
    if (worst.length) sections.push(section("Bottom of the barrel", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${worst.map(gradeLine).join("")}</table>`));
    if (mostLeft || mostRight) {
      const rows = [
        mostLeft ? `<tr><td style="padding:6px 0;font:14px Georgia,serif"><span style="color:#3b6ea5;font-weight:700">◀ Most left</span> — <a href="${SITE}/posts/${mostLeft.id}/" style="color:${INK};text-decoration:none">${esc(mostLeft.data.headline)}</a> <span style="color:${MUTED}">(${esc(leanLabel(leanScoreOf(mostLeft.data)) ?? "")})</span></td></tr>` : "",
        mostRight ? `<tr><td style="padding:6px 0;font:14px Georgia,serif"><span style="color:#b23b2e;font-weight:700">Most right ▶</span> — <a href="${SITE}/posts/${mostRight.id}/" style="color:${INK};text-decoration:none">${esc(mostRight.data.headline)}</a> <span style="color:${MUTED}">(${esc(leanLabel(leanScoreOf(mostRight.data)) ?? "")})</span></td></tr>` : "",
      ].join("");
      sections.push(section("Most biased coverage", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`));
    }
  } else {
    sections.push(
      section(
        "Grades, swings &amp; bias",
        `<p style="font:14px Georgia,serif;color:#333;line-height:1.5;margin:0 0 10px">The week's best- and worst-graded coverage and the most politically biased reports are part of <strong>CladFacts Premium</strong>.</p>
         <a href="${SITE}/upgrade/" style="display:inline-block;background:${ACCENT};color:#fff;font:600 14px Georgia,serif;text-decoration:none;padding:9px 18px">Unlock this week's grades →</a>`
      )
    );
  }

  const html = `<!doctype html><html><body style="margin:0;background:#f5edd9;padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fffdf6;border:1px solid #e6ddcb">
    <tr><td style="padding:22px 26px 8px;text-align:center;border-bottom:2px solid ${INK}">
      <div style="font:700 30px Georgia,serif;letter-spacing:.18em;color:${INK}">CLAD</div>
      <div style="font:11px Georgia,serif;letter-spacing:.12em;color:${MUTED};text-transform:uppercase">The Weekly Review · ${rangeStart}–${rangeEnd}</div>
    </td></tr>
    ${sections.join("")}
    <tr><td style="padding:18px 26px 22px;text-align:center">
      <a href="${SITE}/" style="display:inline-block;background:${INK};color:#fff;font:600 14px Georgia,serif;text-decoration:none;padding:9px 18px">Read CladFacts →</a>
    </td></tr>
    <tr><td style="padding:14px 26px;border-top:1px solid #e6ddcb;font:12px Georgia,serif;color:${MUTED};text-align:center">
      You're receiving the CladFacts weekly newsletter.
      <a href="${SITE}/account/" style="color:${MUTED}">Manage your email preferences</a>.
      <br>© ${new Date().getUTCFullYear()} CladFacts LLC
    </td></tr>
  </table></body></html>`;

  return { subject: `CladFacts Weekly — ${rangeStart}–${rangeEnd}`, html, count: top.length };
}
