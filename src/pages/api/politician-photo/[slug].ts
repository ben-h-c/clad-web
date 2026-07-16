import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  getPoliticianPhotoMap,
  getPoliticianRoster,
  getPoliticianPhotoCredits,
  mergePoliticianPhotoCredit,
  type PhotoCredit,
} from "~/lib/agents";
import { ROSTER_SEEDS } from "~/data/politicianRoster";
import {
  photoForSlug,
  wikiTitleForSlug,
  wikiTitleFromName,
  isCommonsMediaUrl,
  commonsFileFromUrl,
  commonsFilePage,
} from "~/lib/politicianPhotos";

export const prerender = false;

/**
 * Same-origin portrait proxy.
 * Resolution order: static map → live KV photos → Wikipedia by mapped/static title
 * → Wikipedia by roster display name.
 *
 * Licensing (docs/legal/image-claims.md): only Wikimedia COMMONS files are ever
 * served — Commons hosts free-licensed media only, while enwiki-local lead
 * images can be non-free fair-use files we may not reuse. Every resolution
 * path is filtered through isCommonsMediaUrl, and each served portrait's
 * TASL attribution (author/source/license) is captured to KV for
 * /politicians/photo-credits/.
 */

const UA = "CladFactsBot/1.0 (https://cladfacts.com; politician report cards)";

async function wikiThumb(title: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { thumbnail?: { source?: string }; type?: string };
    // Skip disambiguation / empty
    if (j.type === "disambiguation") return null;
    const src = j.thumbnail?.source ?? null;
    // Free-license guard: page/summary returns the article's lead image even
    // when it is a non-free enwiki-local file. Commons-hosted files only.
    return src && isCommonsMediaUrl(src) ? src : null;
  } catch {
    return null;
  }
}

async function nameForSlug(slug: string): Promise<string | null> {
  try {
    const roster = await getPoliticianRoster(env.AGENTS);
    const hit = roster?.seeds?.find((s) => s.slug === slug);
    if (hit?.name) return hit.name;
  } catch {
    /* ignore */
  }
  const staticHit = (ROSTER_SEEDS as { slug: string; name: string }[]).find((s) => s.slug === slug);
  return staticHit?.name ?? null;
}

async function resolveRemote(slug: string): Promise<string | null> {
  const known = photoForSlug(slug);
  if (known && isCommonsMediaUrl(known)) return known;

  try {
    const live = await getPoliticianPhotoMap(env.AGENTS);
    const fromKv = live?.bySlug?.[slug];
    // KV entries predating the Commons-only rule may be enwiki-local; skip them.
    if (fromKv && isCommonsMediaUrl(fromKv)) return fromKv;
  } catch {
    /* ignore */
  }

  const mapped = wikiTitleForSlug(slug);
  if (mapped) {
    const t = await wikiThumb(mapped);
    if (t) return t;
  }

  const name = await nameForSlug(slug);
  if (name) {
    const t = await wikiThumb(wikiTitleFromName(name));
    if (t) return t;
    // Retry without middle initials: "Adam B. Schiff" → "Adam Schiff"
    const simplified = name.replace(/\s+[A-Z]\.\s+/g, " ").trim();
    if (simplified !== name) {
      const t2 = await wikiThumb(wikiTitleFromName(simplified));
      if (t2) return t2;
    }
  }

  return null;
}

/** Strip HTML to plain text (extmetadata's Artist field is HTML). */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetch TASL attribution for a Commons file and store it, keyed by slug.
 * Runs in waitUntil after the portrait is served, at most once per
 * slug+URL (re-fetches only when the served URL changes).
 */
async function captureCredit(slug: string, url: string): Promise<void> {
  try {
    const existing = (await getPoliticianPhotoCredits(env.AGENTS))?.bySlug?.[slug];
    if (existing && existing.url === url) return;

    const file = commonsFileFromUrl(url);
    const filePage = commonsFilePage(url);
    if (!file || !filePage) return;

    const api =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2" +
      "&prop=imageinfo&iiprop=extmetadata" +
      "&iiextmetadatafilter=Artist%7CLicenseShortName%7CLicenseUrl%7CAttributionRequired" +
      `&titles=${encodeURIComponent("File:" + file)}`;
    const r = await fetch(api, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return;
    const j = (await r.json()) as {
      query?: { pages?: { imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }[] };
    };
    const meta = j.query?.pages?.[0]?.imageinfo?.[0]?.extmetadata;
    if (!meta) return;

    const license = meta.LicenseShortName?.value?.trim() || null;
    const attributionRequired = (meta.AttributionRequired?.value ?? "true") !== "false";
    const credit: PhotoCredit = {
      url,
      file,
      filePage,
      artist: meta.Artist?.value ? stripTags(meta.Artist.value).slice(0, 200) || null : null,
      license,
      licenseUrl: meta.LicenseUrl?.value?.trim() || null,
      attributionRequired,
      publicDomain: !attributionRequired || /public domain|^pd\b|cc0/i.test(license ?? ""),
      fetchedAt: new Date().toISOString(),
    };
    await mergePoliticianPhotoCredit(env.AGENTS, slug, credit);
  } catch {
    /* attribution capture is best-effort; the credits page shows "pending" */
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
      "X-Portrait-Source": "wikimedia-commons",
    },
  });

  const cf = (locals as { cfContext?: { waitUntil?: (p: Promise<unknown>) => void } } | undefined)?.cfContext;
  if (cf?.waitUntil) {
    if (cache) cf.waitUntil(cache.put(cacheKey, resp.clone()));
    cf.waitUntil(captureCredit(slug, remote));
  }
  return resp;
};
