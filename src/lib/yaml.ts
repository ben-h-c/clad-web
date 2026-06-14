/**
 * Tiny YAML emitter for our known frontmatter shapes. We don't pull in a full
 * YAML library — we control both the writer (here) and the reader (Astro's
 * content collection). It handles flat key/value, string arrays, and two
 * arrays of objects (citations, keyMoments).
 */

export interface KeyMoment {
  claim: string;
  verdict: string;
  note: string;
}

export interface Frontmatter {
  type: "verdict" | "broadcast";
  headline: string;
  kicker?: string;
  summary: string;
  publishedAt: string; // ISO date
  sourceUrl: string;
  sourceTitle?: string;
  section: string;
  draft?: boolean;
  featured?: boolean;
  correctionOf?: string;
  citations: { title: string; url: string }[];

  // verdict
  verdict?: string;

  // broadcast
  letterGrade?: string;
  factualityScore?: number;
  politicalLean?: string;
  leanScore?: number;
  leanRationale?: string;
  gradeRationale?: string;
  topics?: string[];
  assessment?: string;
  notableConcerns?: string[];
  keyMoments?: KeyMoment[];
  videoId?: string;
  videoTitle?: string;
  thumbnail?: string;
}

export function emitPost(fm: Frontmatter, body: string): string {
  const lines: string[] = ["---"];
  lines.push(`type: ${q(fm.type)}`);
  lines.push(`headline: ${q(fm.headline)}`);
  if (fm.kicker) lines.push(`kicker: ${q(fm.kicker)}`);
  lines.push(`summary: ${q(fm.summary)}`);
  lines.push(`publishedAt: ${fm.publishedAt}`);
  lines.push(`sourceUrl: ${q(fm.sourceUrl)}`);
  if (fm.sourceTitle) lines.push(`sourceTitle: ${q(fm.sourceTitle)}`);
  lines.push(`section: ${q(fm.section)}`);
  if (fm.draft) lines.push(`draft: true`);
  if (fm.featured) lines.push(`featured: true`);
  if (fm.correctionOf) lines.push(`correctionOf: ${q(fm.correctionOf)}`);

  if (fm.type === "verdict") {
    if (fm.verdict) lines.push(`verdict: ${q(fm.verdict)}`);
  } else {
    if (fm.letterGrade) lines.push(`letterGrade: ${q(fm.letterGrade)}`);
    if (fm.factualityScore != null)
      lines.push(`factualityScore: ${Math.round(fm.factualityScore)}`);
    if (fm.politicalLean) lines.push(`politicalLean: ${q(fm.politicalLean)}`);
    if (fm.leanScore != null) lines.push(`leanScore: ${Math.round(fm.leanScore)}`);
    if (fm.leanRationale) lines.push(`leanRationale: ${q(fm.leanRationale)}`);
    if (fm.gradeRationale) lines.push(`gradeRationale: ${q(fm.gradeRationale)}`);
    emitStringArray(lines, "topics", fm.topics ?? []);
    if (fm.assessment) lines.push(`assessment: ${q(fm.assessment)}`);
    emitStringArray(lines, "notableConcerns", fm.notableConcerns ?? []);
    emitKeyMoments(lines, fm.keyMoments ?? []);
    if (fm.videoId) lines.push(`videoId: ${q(fm.videoId)}`);
    if (fm.videoTitle) lines.push(`videoTitle: ${q(fm.videoTitle)}`);
    if (fm.thumbnail) lines.push(`thumbnail: ${q(fm.thumbnail)}`);
  }

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

function emitStringArray(lines: string[], key: string, arr: string[]): void {
  const items = arr.map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) {
    lines.push(`${key}: []`);
    return;
  }
  lines.push(`${key}:`);
  for (const item of items) lines.push(`  - ${q(item)}`);
}

function emitKeyMoments(lines: string[], moments: KeyMoment[]): void {
  if (moments.length === 0) {
    lines.push("keyMoments: []");
    return;
  }
  lines.push("keyMoments:");
  for (const m of moments) {
    lines.push(`  - claim: ${q(m.claim)}`);
    lines.push(`    verdict: ${q(m.verdict)}`);
    lines.push(`    note: ${q(m.note)}`);
  }
}

function q(s: string): string {
  // Double-quote and escape so arbitrary text is safe as a single-line YAML
  // scalar. Newlines must be escaped to \n — a raw newline inside a quoted
  // single-line scalar is invalid YAML. The reader decodes \n back to a
  // newline, so multi-paragraph summary/assessment round-trips correctly.
  return `"${s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")}"`;
}
