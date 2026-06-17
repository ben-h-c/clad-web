import { getCollection } from "astro:content";
import { getAccess } from "~/lib/access";

export const prerender = false;

// Search index of all published posts (carries grades + lean), so it's
// full-access only — the /search page that consumes it is gated too.
export async function GET({ request }: { request: Request }) {
  const access = await getAccess(request.headers);
  if (!access.fullAccess) {
    return new Response(JSON.stringify({ error: "upgrade" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

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
