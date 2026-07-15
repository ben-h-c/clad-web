import type { APIRoute } from "astro";

export const prerender = false;

/** Old coverage-tournament OG image — permanent redirect to race-board card. */
export const GET: APIRoute = async () => {
  return new Response(null, {
    status: 301,
    headers: {
      Location: "/og/bracket.png",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
