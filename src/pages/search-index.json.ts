import { getCollection } from "astro:content";

export const prerender = true;

// A lightweight, prerendered search index of all published posts. The /search
// page loads this and filters client-side. Rebuilt on each deploy (so new
// posts appear after the ~30s rebuild that publishing triggers).
export async function GET() {
  const posts = (await getCollection("posts", (p) => !p.data.draft)).sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf()
  );

  const records = posts.map((p) => {
    const d = p.data;
    const channel = d.sourceTitle ?? (() => {
      try { return new URL(d.sourceUrl).hostname.replace(/^www\./, ""); } catch { return ""; }
    })();
    const blurb = (d.type === "broadcast" && d.gradeRationale) ? d.gradeRationale : d.summary;
    const text = [
      d.headline, d.summary, d.assessment ?? "", d.gradeRationale ?? "",
      (d.topics ?? []).join(" "), channel,
    ].join(" ").toLowerCase();
    return {
      id: p.id,
      headline: d.headline,
      blurb,
      topics: d.topics ?? [],
      channel,
      grade: d.type === "broadcast" ? (d.letterGrade ?? null) : (d.verdict ?? null),
      isBroadcast: d.type === "broadcast",
      leanScore: typeof d.leanScore === "number" ? d.leanScore : null,
      date: d.publishedAt.toISOString(),
      thumbnail: d.thumbnail ?? null,
      text,
    };
  });

  return new Response(JSON.stringify(records), {
    headers: { "Content-Type": "application/json" },
  });
}
