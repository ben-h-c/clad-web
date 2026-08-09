/**
 * Wikimedia Commons URL hygiene + byte validation for agent runners.
 * Mirrors src/lib/commonsMedia.ts (keep in sync).
 *
 * Policy: strip tracking params; never invent unchecked widths; HEAD/GET
 * validate before writing imageUrl into AGENTS KV.
 */

const DEFAULT_UA = "CladFactsBot/1.0 (https://cladfacts.com; commons-media)";

/** Widths known to work for many Commons files. */
export const COMMONS_SAFE_THUMB_WIDTHS = [330, 500, 960];

export function isCommonsUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === "upload.wikimedia.org" &&
      u.pathname.startsWith("/wikipedia/commons/")
    );
  } catch {
    return false;
  }
}

/**
 * Canonicalize a Commons upload URL: drop query/hash, keep path as returned.
 * Does NOT rewrite pixel widths.
 */
export function cleanCommonsUrl(url) {
  const raw = String(url || "").trim();
  if (!raw || !isCommonsUrl(raw)) return null;
  try {
    const u = new URL(raw);
    u.search = "";
    u.hash = "";
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

/** Candidate URLs: cleaned path + alternate safe thumb widths. */
export function commonsThumbCandidates(url) {
  const cleaned = cleanCommonsUrl(url);
  if (!cleaned) return [];
  const out = [cleaned];
  const push = (u) => {
    if (u && !out.includes(u)) out.push(u);
  };

  try {
    const path = new URL(cleaned).pathname;
    const thumbPx = path.match(/\/(\d+)px-/);
    if (thumbPx) {
      for (const w of COMMONS_SAFE_THUMB_WIDTHS) {
        if (String(w) === thumbPx[1]) continue;
        push(cleaned.replace(/\/\d+px-/, `/${w}px-`));
      }
      return out;
    }

    const orig = path.match(
      /^\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/i
    );
    if (orig) {
      const [, a, b, file] = orig;
      for (const w of COMMONS_SAFE_THUMB_WIDTHS) {
        push(
          `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${b}/${file}/${w}px-${file}`
        );
      }
    }
  } catch {
    /* cleaned only */
  }
  return out;
}

/**
 * Confirm a URL returns an image (or at least HTTP 200 with image-like type).
 * Tries HEAD then a tiny ranged GET — Wikimedia sometimes omits Content-Type on HEAD.
 */
export async function validateImageUrl(url, { ua = DEFAULT_UA, timeoutMs = 6000 } = {}) {
  const cleaned = cleanCommonsUrl(url) || String(url || "").trim();
  if (!cleaned || !/^https:\/\//i.test(cleaned)) return false;

  const headers = { "User-Agent": ua };

  try {
    const head = await fetch(cleaned, {
      method: "HEAD",
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (head.ok) {
      const ct = String(head.headers.get("content-type") || "").toLowerCase();
      if (!ct || ct.startsWith("image/")) return true;
      // Non-image content-type on HEAD → try GET (some CDNs lie on HEAD)
    } else if (head.status === 405 || head.status === 403 || head.status === 501) {
      /* fall through to GET */
    } else if (head.status >= 400) {
      return false;
    }
  } catch {
    /* try GET */
  }

  try {
    const get = await fetch(cleaned, {
      method: "GET",
      headers: { ...headers, Range: "bytes=0-1023" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    // 200 or 206 Partial Content
    if (!(get.ok || get.status === 206)) return false;
    const ct = String(get.headers.get("content-type") || "").toLowerCase();
    if (ct && !ct.startsWith("image/") && !ct.startsWith("application/octet-stream")) {
      return false;
    }
    // Drain a tiny bit then cancel — avoid downloading full originals
    try {
      await get.arrayBuffer();
    } catch {
      /* ignore body read errors after status check */
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * First candidate that validates as a live image, or null.
 */
export async function firstValidCommonsUrl(url, opts) {
  for (const candidate of commonsThumbCandidates(url)) {
    if (await validateImageUrl(candidate, opts)) return candidate;
  }
  return null;
}

/**
 * Wikipedia page title clearly refers to this person (not a historical namesake).
 * Requires first + last name tokens when the person has 2+ name parts.
 */
export function wikiTitleMatchesPerson(wikiTitle, personName) {
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/\(.*?\)/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const wt = norm(wikiTitle);
  const pn = norm(personName);
  if (!wt || !pn) return false;

  const pParts = pn.split(" ").filter((w) => w.length >= 2);
  if (pParts.length < 2) {
    return wt === pn || wt.startsWith(pn + " ") || wt.includes(" " + pn);
  }
  const first = pParts[0];
  const last = pParts[pParts.length - 1];
  return wt.includes(first) && wt.includes(last);
}
