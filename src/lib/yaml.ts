/**
 * Tiny YAML emitter for our known frontmatter shape. We don't pull in a
 * full YAML library — frontmatter here is flat key/value plus one array
 * of {title,url} objects, and we control both sides.
 */

interface Frontmatter {
  headline: string;
  kicker?: string;
  summary: string;
  verdict: string;
  publishedAt: string; // ISO date
  sourceUrl: string;
  sourceTitle?: string;
  section: string;
  draft?: boolean;
  correctionOf?: string;
  citations: { title: string; url: string }[];
}

export function emitPost(fm: Frontmatter, body: string): string {
  const lines: string[] = ["---"];
  lines.push(`headline: ${q(fm.headline)}`);
  if (fm.kicker) lines.push(`kicker: ${q(fm.kicker)}`);
  lines.push(`summary: ${q(fm.summary)}`);
  lines.push(`verdict: ${q(fm.verdict)}`);
  lines.push(`publishedAt: ${fm.publishedAt}`);
  lines.push(`sourceUrl: ${q(fm.sourceUrl)}`);
  if (fm.sourceTitle) lines.push(`sourceTitle: ${q(fm.sourceTitle)}`);
  lines.push(`section: ${q(fm.section)}`);
  if (fm.draft) lines.push(`draft: true`);
  if (fm.correctionOf) lines.push(`correctionOf: ${q(fm.correctionOf)}`);
  if (fm.citations.length === 0) {
    lines.push("citations: []");
  } else {
    lines.push("citations:");
    for (const c of fm.citations) {
      lines.push(`  - title: ${q(c.title)}`);
      lines.push(`    url: ${q(c.url)}`);
    }
  }
  lines.push("---");
  lines.push("");
  lines.push(body.trim());
  lines.push("");
  return lines.join("\n");
}

function q(s: string): string {
  // Always double-quote and escape \ and " — safest for arbitrary strings.
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
