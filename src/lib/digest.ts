/**
 * Daily news digest — stacked 16:9 report cards, same chrome as the app.
 */
import type { CollectionEntry } from "astro:content";
import { canonicalTopic } from "./topics.ts";
import {
  EMAIL,
  emailHref,
  emailSectionHead,
  emailShell,
  emailStoryFromPost,
  escHtml,
} from "./emailTheme.ts";

const SITE = EMAIL.site;
const { ink, muted, font } = EMAIL;

type Post = CollectionEntry<"posts">;

export interface DigestResult {
  subject: string;
  html: string;
  count: number;
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

  const hello = opts.name ? `Hi ${escHtml(opts.name.split(/\s+/)[0]!)},` : "Hi,";
  const intro = hasFollowed
    ? "The latest on topics you follow, plus other reports worth a look."
    : "New graded reports from the CladFacts desk.";

  const cards = ordered
    .map(
      (p) =>
        `<tr><td style="padding:0 0 16px">${emailStoryFromPost(p, opts.showGrades)}</td></tr>`
    )
    .join("");

  const bodyHtml =
    `<tr><td style="padding:0 4px 16px">
      <p style="font-family:${font};font-size:16px;font-weight:600;color:${ink};margin:0 0 6px">${hello}</p>
      <p style="font-family:${font};font-size:14px;line-height:1.5;color:${muted};margin:0">${intro}</p>
    </td></tr>` +
    (hasFollowed ? emailSectionHead("On your topics") : emailSectionHead("Latest reports")) +
    cards;

  const html = emailShell({
    title: "",
    subtitle: "Daily digest",
    body: bodyHtml,
    previewText: intro,
    ctaHref: emailHref("/"),
    ctaLabel: "Open CladFacts",
    footerNote: `You're getting this because you turned on the news digest.
      <a href="${SITE}/account/" style="color:${muted}">Manage email</a>.`,
  });

  const subject = hasFollowed
    ? `CladFacts — ${ordered.length} new on your topics`
    : `CladFacts — ${ordered.length} new report${ordered.length === 1 ? "" : "s"}`;

  return { subject, html, count: ordered.length };
}
