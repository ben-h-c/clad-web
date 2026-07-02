/**
 * Server-side post search, shared by /api/search (JSON) and /search/ (SSR).
 * Scores + filters posts on the server and returns only the matching results,
 * so the browser never downloads the full index. Grades + lean are omitted for
 * restricted (free/anonymous) readers — same model as the rest of the site.
 */
import type { CollectionEntry } from "astro:content";

export interface SearchParams {
  q?: string;
  outlet?: string;
  grade?: string;
  bias?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface SearchResult {
  id: string;
  headline: string;
  blurb: string;
  channel: string;
  date: string;
  thumbnail: string | null;
  grade: string | null;
  leanScore: number | null;
}

export function searchPosts(
  posts: CollectionEntry<"posts">[],
  params: SearchParams,
  locked: boolean
): { total: number; results: SearchResult[] } {
  const q = (params.q || "").trim().toLowerCase();
  const outlet = params.outlet || "";
  const grade = (params.grade || "").toUpperCase();
  const bias = params.bias || "";
  const from = params.from || "";
  const to = params.to || "";
  const limit = Math.min(100, Math.max(1, params.limit || 40));

  const sorted = [...posts].sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf()
  );

  const terms = q.split(/\s+/).filter((t) => t.length > 1);
  const fromMs = from ? new Date(from).getTime() : null;
  const toMs = to ? new Date(`${to}T23:59:59.999Z`).getTime() : null;

  const scored: { p: (typeof sorted)[number]; s: number }[] = [];
  for (const p of sorted) {
    const d = p.data;
    const dateMs = d.publishedAt.valueOf();
    if (fromMs && dateMs < fromMs) continue;
    if (toMs && dateMs > toMs) continue;

    const channel = d.sourceTitle ?? "";
    if (outlet && channel !== outlet) continue;

    const lean = typeof d.leanScore === "number" ? d.leanScore : null;
    // Grade/bias filters only apply for full-access readers (free users can't
    // filter on hidden data).
    if (!locked && grade) {
      const g = d.type === "broadcast" ? d.letterGrade : null;
      if (!g || g.charAt(0).toUpperCase() !== grade) continue;
    }
    if (!locked && bias) {
      if (lean === null) continue;
      const dir = lean <= -8 ? "left" : lean >= 8 ? "right" : "center";
      if (dir !== bias) continue;
    }

    let score = 0;
    if (terms.length) {
      const hl = d.headline.toLowerCase();
      const tp = (d.topics ?? []).join(" ").toLowerCase();
      const text = `${d.headline} ${d.summary} ${d.assessment ?? ""} ${(d.topics ?? []).join(" ")} ${channel}`.toLowerCase();
      let ok = true;
      for (const t of terms) {
        if (hl.includes(t)) score += 3;
        else if (tp.includes(t)) score += 2;
        else if (text.includes(t)) score += 1;
        else { ok = false; break; }
      }
      if (!ok) continue;
    }
    scored.push({ p, s: score });
  }

  scored.sort((a, b) =>
    b.s - a.s || b.p.data.publishedAt.valueOf() - a.p.data.publishedAt.valueOf()
  );

  const total = scored.length;
  const results = scored.slice(0, limit).map(({ p }) => {
    const d = p.data;
    const channel = d.sourceTitle ?? "";
    const blurb = (!locked && d.type === "broadcast" && d.gradeRationale) ? d.gradeRationale : d.summary;
    return {
      id: p.id,
      headline: d.headline,
      blurb,
      channel,
      date: d.publishedAt.toISOString(),
      thumbnail: d.thumbnail ?? null,
      grade: locked ? null : d.type === "broadcast" ? (d.letterGrade ?? null) : (d.verdict ?? null),
      leanScore: locked ? null : typeof d.leanScore === "number" ? d.leanScore : null,
    };
  });

  return { total, results };
}
