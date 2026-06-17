import { getCollection } from "astro:content";
import { getAccess } from "~/lib/access";

export const prerender = false;

// Search index of all published posts. Open to everyone (SEO + free search),
// but grade + political-lean are omitted for restricted readers (Premium).
export async function GET({ request }: { request: Request }) {
  const access = await getAccess(request.headers);
  const locked = !access.fullAccess;

  const posts = (await getCollection("posts", (p) => !p.data.draft)).sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf()
  );

  const records = posts.map((p) => {
    const d = p.data;
    const channel = d.sourceTitle ?? (() => {
      try { return new URL(d.sourceUrl).hostname.replace(/^www\./, ""); } catch { return ""; }
    })();
    const blurb = (!locked && d.type === "broadcast" && d.gradeRationale) ? d.gradeRationale : d.summary;
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
      grade: locked ? null : d.type === "broadcast" ? (d.letterGrade ?? null) : (d.verdict ?? null),
      isBroadcast: d.type === "broadcast",
      leanScore: locked ? null : (typeof d.leanScore === "number" ? d.leanScore : null),
      date: d.publishedAt.toISOString(),
      thumbnail: d.thumbnail ?? null,
      text,
    };
  });

  return new Response(JSON.stringify(records), {
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}
