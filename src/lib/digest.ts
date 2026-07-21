/**
 * News-digest composition. Soft Neutral dark email chrome matches the site dark theme.
 * Digests only go to accounts (full access); `showGrades:false` kept for future use.
 */
import type { CollectionEntry } from "astro:content";
import { canonicalTopic, leanScoreOf } from "./topics.ts";
import { EMAIL, emailShell, escHtml, gradePill } from "./emailTheme.ts";

const SITE = EMAIL.site;
const { ink, muted, accent, rule, font, body } = EMAIL;

type Post = CollectionEntry<"posts">;

export interface DigestResult {
  subject: string;
  html: string;
  count: number;
}

function leanLabel(s: number | null): string | null {
  if (s == null) return null;
  return Math.abs(s) < 5 ? "Centered" : `${Math.abs(s)}% ${s > 0 ? "Right" : "Left"}-leaning`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function thumbUrl(d: Post["data"]): string | null {
  if (d.thumbnail) return d.thumbnail.startsWith("/") ? SITE + d.thumbnail : d.thumbnail;
  if (d.videoId) return `https://img.youtube.com/vi/${d.videoId}/hqdefault.jpg`;
  return null;
}

export function buildDigest(opts: {
  posts: Post[];
  followed: string[];
  showGrades: boolean;
  sinceMs: number;
  name?: string;
  max?: number;
}): DigestResult | null {
  const max = opts.max ?? 7;
  const fresh = opts.posts.filter((p) => p.data.publishedAt.valueOf() >= opts.sinceMs);
  if (fresh.length === 0) return null;

  const follow = new Set(opts.followed.map((t) => canonicalTopic(t).toLowerCase()).filter(Boolean));
  const matches = (p: Post) =>
    follow.size > 0 && (p.data.topics ?? []).some((t) => follow.has(canonicalTopic(t).toLowerCase()));

  const byNew = [...fresh].sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
  const lead = byNew.filter(matches);
  const rest = byNew.filter((p) => !matches(p));
  const ordered = [...lead, ...rest].slice(0, max);
  const hasFollowed = lead.length > 0;

  const items = ordered
    .map((p) => {
      const d = p.data;
      const url = `${SITE}/posts/${p.id}/`;
      const source = d.sourceTitle ?? "";
      const meta = [source, fmtDate(d.publishedAt)].filter(Boolean).join(" · ");
      let scoreLine = "";
      if (opts.showGrades) {
        const lean = leanLabel(leanScoreOf(d));
        const bits = [
          d.letterGrade ? gradePill(d.letterGrade) : null,
          lean ? `<span style="font:600 13px ${font};color:${muted}">${escHtml(lean)}</span>` : null,
        ].filter(Boolean);
        if (bits.length) {
          scoreLine = `<div style="margin:6px 0 4px;line-height:1.6">${bits.join(" &nbsp; ")}</div>`;
        }
      } else {
        scoreLine = `<div style="font:13px ${font};color:${accent};margin:4px 0"><a href="${SITE}/register/" style="color:${accent};text-decoration:none;font-weight:600">Unlock the grade &amp; lean — free account →</a></div>`;
      }
      const blurb = escHtml((d.summary || "").slice(0, 160));
      const thumb = thumbUrl(d);
      const thumbCell = thumb
        ? `<td width="128" valign="top" style="padding-right:14px">
             <a href="${url}"><img src="${escHtml(thumb)}" width="128" height="72" alt="" style="display:block;width:128px;height:72px;object-fit:cover;border:0;border-radius:10px"></a>
           </td>`
        : "";
      return `
        <tr><td style="padding:14px 0;border-bottom:1px solid ${rule}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            ${thumbCell}
            <td valign="top">
              <a href="${url}" style="font:700 16px ${font};color:${ink};text-decoration:none;line-height:1.3">${escHtml(d.headline)}</a>
              <div style="font:12px ${font};color:${muted};margin:4px 0">${escHtml(meta)}</div>
              ${scoreLine}
              <div style="font:13px ${font};color:${body};line-height:1.5">${blurb}…</div>
            </td>
          </tr></table>
        </td></tr>`;
    })
    .join("");

  const hello = opts.name ? `Hi ${escHtml(opts.name.split(/\s+/)[0]!)},` : "Hello,";
  const intro = hasFollowed
    ? "Here's the latest on the topics you follow, plus other fact-checks worth a look."
    : "Here are the newest fact-checks from the CladFacts desk.";

  const bodyHtml = `<tr><td style="padding:22px 28px 0">
      <p style="font:16px ${font};color:${ink};margin:0 0 6px;font-weight:600">${hello}</p>
      <p style="font:14px ${font};color:${muted};margin:0 0 8px;line-height:1.5">${intro}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px">${items}</table>
    </td></tr>`;

  const html = emailShell({
    title: "",
    subtitle: "Your News Digest",
    body: bodyHtml,
    ctaHref: `${SITE}/`,
    ctaLabel: "Read more at CladFacts →",
    footerNote: `You're receiving this because you turned on the News Digest.
      <a href="${SITE}/account/" style="color:${muted}">Manage your email preferences</a>.`,
  });

  const subject = hasFollowed
    ? `Your CladFacts digest — ${ordered.length} new on your topics`
    : `Your CladFacts digest — ${ordered.length} new fact-check${ordered.length === 1 ? "" : "s"}`;

  return { subject, html, count: ordered.length };
}
