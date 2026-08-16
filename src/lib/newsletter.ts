/**
 * Weekly newsletter — week in review as app-like report cards + grade board.
 */
import type { CollectionEntry } from "astro:content";
import { gradeToGpa, gpaToGrade, leanScoreOf } from "./topics.ts";
import {
  EMAIL,
  emailSectionHead,
  emailShell,
  emailStoryFromPost,
  escHtml,
  gradePill,
  leanChip,
} from "./emailTheme.ts";

const SITE = EMAIL.site;
const { ink, muted, accent, card, rule, font, body, accentSoft, ctaText } = EMAIL;
const WEEK = 7 * 86_400_000;

type Post = CollectionEntry<"posts">;

export interface NewsletterResult {
  subject: string;
  html: string;
  count: number;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

function gradeBoardRow(p: Post): string {
  const d = p.data;
  const lean = leanScoreOf(d);
  return `<tr>
    <td width="48" valign="top" style="padding:10px 10px 10px 0">${d.letterGrade ? gradePill(d.letterGrade) : ""}</td>
    <td valign="middle" style="padding:10px 0;border-bottom:1px solid ${rule}">
      <a href="${SITE}/posts/${p.id}/" style="font:600 15px/1.35 ${font};color:${ink};text-decoration:none">${escHtml(d.headline)}</a>
      <div style="font:12px ${font};color:${muted};margin-top:4px">${escHtml(d.sourceTitle ?? "")}${lean != null ? " · " : ""}${lean != null ? leanChip(lean) : ""}</div>
    </td>
  </tr>`;
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

  const rangeStart = fmtDay(new Date(since));
  const rangeEnd = fmtDay(new Date(now));

  const parts: string[] = [];

  if (opts.showGrades) {
    parts.push(emailSectionHead("This week"));
    parts.push(`<tr><td style="padding:0 0 8px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="32%" valign="top" bgcolor="${card}" style="background:${card};border:1px solid ${rule};border-radius:18px;padding:14px 8px;text-align:center">
          <div style="font:700 22px ${font};color:${ink}">${fresh.length}</div>
          <div style="font:700 10px ${font};letter-spacing:0.1em;text-transform:uppercase;color:${muted};margin-top:4px">Reports</div>
        </td>
        <td width="2%"></td>
        <td width="32%" valign="top" bgcolor="${card}" style="background:${card};border:1px solid ${rule};border-radius:18px;padding:14px 8px;text-align:center">
          <div style="font:700 22px ${font};color:${ink}">${escHtml(avgGrade ?? "—")}</div>
          <div style="font:700 10px ${font};letter-spacing:0.1em;text-transform:uppercase;color:${muted};margin-top:4px">Avg grade</div>
        </td>
        <td width="2%"></td>
        <td width="32%" valign="top" bgcolor="${card}" style="background:${card};border:1px solid ${rule};border-radius:18px;padding:14px 8px;text-align:center">
          <div style="font:700 16px ${font};color:${ink};line-height:1.35">${left}<span style="color:${muted};font-weight:500"> L</span> · ${center}<span style="color:${muted};font-weight:500"> C</span> · ${right}<span style="color:${muted};font-weight:500"> R</span></div>
          <div style="font:700 10px ${font};letter-spacing:0.1em;text-transform:uppercase;color:${muted};margin-top:4px">Lean mix</div>
        </td>
      </tr></table>
    </td></tr>`);
  }

  parts.push(emailSectionHead("Top stories"));
  for (const p of top) {
    parts.push(`<tr><td style="padding:0 0 16px">${emailStoryFromPost(p, opts.showGrades)}</td></tr>`);
  }

  if (opts.showGrades) {
    if (best.length) {
      parts.push(emailSectionHead("Best graded"));
      parts.push(`<tr><td style="padding:0 0 8px;background:${card};border-radius:18px;border:1px solid ${rule}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:4px 14px 8px">${best.map(gradeBoardRow).join("")}</table>
      </td></tr>`);
    }
    if (worst.length) {
      parts.push(emailSectionHead("Worst graded"));
      parts.push(`<tr><td style="padding:0 0 8px;background:${card};border-radius:18px;border:1px solid ${rule}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:4px 14px 8px">${worst.map(gradeBoardRow).join("")}</table>
      </td></tr>`);
    }
  } else {
    parts.push(`<tr><td style="padding:8px 18px 20px;background:${accentSoft};border-radius:18px">
      <p style="font:14px/1.55 ${font};color:${body};margin:0 0 12px">Best- and worst-graded coverage unlocks with a free CladFacts account. No card.</p>
      <a href="${SITE}/register/" style="display:inline-block;background:${accent};color:${ctaText};font:600 14px ${font};text-decoration:none;padding:11px 20px;border-radius:999px">See grades free</a>
    </td></tr>`);
  }

  const html = emailShell({
    title: `${rangeStart} – ${rangeEnd}`,
    subtitle: "Weekly review",
    previewText: `${fresh.length} graded reports this week.`,
    body: parts.join(""),
    ctaHref: `${SITE}/`,
    ctaLabel: "Open CladFacts",
    footerNote: `You're getting the CladFacts weekly.
      <a href="${SITE}/account/" style="color:${muted}">Manage email</a>.`,
  });

  return { subject: `CladFacts Weekly — ${rangeStart}–${rangeEnd}`, html, count: top.length };
}
