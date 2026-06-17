/**
 * News-digest composition. Picks recent fact-checks for a reader — leading with
 * coverage on the topics they follow, then filling with the period's newest —
 * and renders an email. Subscribers (paid/trial) see grades + political lean;
 * free readers get headlines with an upgrade nudge.
 */
import type { CollectionEntry } from "astro:content";
import { canonicalTopic, leanScoreOf } from "./topics";

const SITE = "https://cladfacts.com";
const INK = "#1a140d";
const MUTED = "#6b6257";
const ACCENT = "rgb(150,30,20)";

type Post = CollectionEntry<"posts">;

export interface DigestResult {
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

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Build a digest, or null when there's nothing new in the window. `followed`
 * is the user's raw followed-topic strings; `showGrades` gates premium content.
 */
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
          d.letterGrade ? `Grade ${esc(d.letterGrade)}` : null,
          lean ? esc(lean) : null,
        ].filter(Boolean);
        if (bits.length) {
          scoreLine = `<div style="font:600 13px Georgia,serif;color:${INK};margin:2px 0 4px">${bits.join(" &nbsp;·&nbsp; ")}</div>`;
        }
      } else {
        scoreLine = `<div style="font:13px Georgia,serif;color:${ACCENT};margin:2px 0 4px"><a href="${SITE}/upgrade/" style="color:${ACCENT};text-decoration:none">🔒 Unlock the grade &amp; lean →</a></div>`;
      }
      const blurb = esc((d.summary || "").slice(0, 180));
      return `
        <tr><td style="padding:14px 0;border-bottom:1px solid #e6ddcb">
          <a href="${url}" style="font:700 18px Georgia,serif;color:${INK};text-decoration:none;line-height:1.25">${esc(d.headline)}</a>
          <div style="font:12px Georgia,serif;color:${MUTED};margin:3px 0">${esc(meta)}</div>
          ${scoreLine}
          <div style="font:14px Georgia,serif;color:#333;line-height:1.5">${blurb}…</div>
        </td></tr>`;
    })
    .join("");

  const hello = opts.name ? `Hi ${esc(opts.name.split(/\s+/)[0])},` : "Hello,";
  const intro = hasFollowed
    ? "Here's the latest on the topics you follow, plus other fact-checks worth a look."
    : "Here are the newest fact-checks from the CladFacts desk.";

  const html = `<!doctype html><html><body style="margin:0;background:#f5edd9;padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fffdf6;border:1px solid #e6ddcb">
    <tr><td style="padding:22px 26px 6px;text-align:center;border-bottom:2px solid ${INK}">
      <div style="font:700 30px Georgia,serif;letter-spacing:.18em;color:${INK}">CLAD</div>
      <div style="font:11px Georgia,serif;letter-spacing:.12em;color:${MUTED};text-transform:uppercase">Your News Digest</div>
    </td></tr>
    <tr><td style="padding:20px 26px 0">
      <p style="font:15px Georgia,serif;color:${INK};margin:0 0 4px">${hello}</p>
      <p style="font:14px Georgia,serif;color:${MUTED};margin:0">${intro}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">${items}</table>
    </td></tr>
    <tr><td style="padding:8px 26px 22px;text-align:center">
      <a href="${SITE}/" style="display:inline-block;background:${ACCENT};color:#fff;font:600 14px Georgia,serif;text-decoration:none;padding:9px 18px;margin-top:8px">Read more at CladFacts →</a>
    </td></tr>
    <tr><td style="padding:14px 26px;border-top:1px solid #e6ddcb;font:12px Georgia,serif;color:${MUTED};text-align:center">
      You're receiving this because you turned on the News Digest.
      <a href="${SITE}/account/" style="color:${MUTED}">Manage your email preferences</a>.
      <br>© ${new Date().getUTCFullYear()} CladFacts LLC
    </td></tr>
  </table></body></html>`;

  const subject = hasFollowed
    ? `Your CladFacts digest — ${ordered.length} new on your topics`
    : `Your CladFacts digest — ${ordered.length} new fact-check${ordered.length === 1 ? "" : "s"}`;

  return { subject, html, count: ordered.length };
}
