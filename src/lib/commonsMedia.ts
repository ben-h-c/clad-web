/**
 * Wikimedia Commons URL hygiene for homepage desk media
 * (Human Spotlight, Today in history).
 *
 * Policy (2026-08-08): strip tracking params; never invent arbitrary thumb
 * widths (440/640 often 400); runners HEAD/GET-validate before store.
 * See docs/decisions.md.
 */

export function isCommonsMediaUrl(url: string): boolean {
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
 * Does NOT rewrite pixel widths (Wikimedia's thumb matrix is irregular).
 */
export function cleanCommonsUrl(url: string | null | undefined): string | null {
  const raw = String(url || "").trim();
  if (!raw || !isCommonsMediaUrl(raw)) return null;
  try {
    const u = new URL(raw);
    u.search = "";
    u.hash = "";
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

/** Widths known to work for many Commons files (politician pipeline uses 330). */
export const COMMONS_SAFE_THUMB_WIDTHS = [330, 500, 960] as const;

/**
 * Candidate URLs for a Commons still: original cleaned path first, then
 * alternate thumb widths. Callers must validate before storing/serving.
 */
export function commonsThumbCandidates(url: string | null | undefined): string[] {
  const cleaned = cleanCommonsUrl(url);
  if (!cleaned) return [];
  const out: string[] = [cleaned];
  const push = (u: string) => {
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

    // Full original: …/commons/a/ab/File.jpg → try mid-size thumbs
    const orig = path.match(
      /^\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/i
    );
    if (orig) {
      const [, a, b, file] = orig;
      const encFile = file!;
      for (const w of COMMONS_SAFE_THUMB_WIDTHS) {
        push(
          `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${b}/${encFile}/${w}px-${encFile}`
        );
      }
    }
  } catch {
    /* keep cleaned only */
  }
  return out;
}
