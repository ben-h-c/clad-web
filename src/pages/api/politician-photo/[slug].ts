import type { APIRoute } from "astro";
import { photoForSlug, wikiTitleForSlug } from "~/lib/politicianPhotos";

export const prerender = false;

/**
 * Same-origin portrait proxy.
 * Wikimedia only serves pre-generated thumb sizes — we store exact API URLs.
 * Proxying avoids hotlink/referrer quirks and sets long browser cache.
 */

const UA = "CladFactsBot/1.0 (https://cladfacts.com; politician report cards)";

async function resolveRemote(slug: string): Promise<string | null> {
  const known = photoForSlug(slug);
  if (known) return known;

  const title = wikiTitleForSlug(slug);
  if (!title) return null;
  try {
    const r = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { thumbnail?: { source?: string } };
    return j.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const slug = String(params.slug ?? "").trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return new Response(null, { status: 404 });
  }

  const cache = (caches as unknown as { default?: Cache }).default;
  const cacheKey = new Request(new URL(request.url).origin + `/api/politician-photo/${slug}`);
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch {
      /* ignore */
    }
  }

  const remote = await resolveRemote(slug);
  if (!remote) return new Response(null, { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetch(remote, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
  } catch {
    return new Response(null, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
  }

  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return new Response(null, { status: 502 });
  }

  const resp = new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      "X-Portrait-Source": "wikimedia",
    },
  });

  const cf = (locals as { cfContext?: { waitUntil?: (p: Promise<unknown>) => void } } | undefined)?.cfContext;
  if (cf?.waitUntil && cache) {
    cf.waitUntil(cache.put(cacheKey, resp.clone()));
  }
  return resp;
};
