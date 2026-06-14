/**
 * Validate citation URLs so dead "page not found" links never ship. We're
 * deliberately lenient: only drop links that are clearly gone (HTTP 404/410 or
 * an unresolvable domain). Links that merely block bots (401/403/405/429) or
 * are transiently down (5xx/timeout) are KEPT — dropping them would remove
 * legitimate sources. Works in both the Worker and the Node runner (fetch only).
 */
export interface Citation {
  title: string;
  url: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function validateCitations(
  cites: Citation[],
  timeoutMs = 8000
): Promise<Citation[]> {
  if (!Array.isArray(cites) || cites.length === 0) return [];
  const checked = await Promise.all(cites.map((c) => checkOne(c, timeoutMs)));
  return checked.filter((c): c is Citation => c !== null);
}

async function checkOne(c: Citation, timeoutMs: number): Promise<Citation | null> {
  if (!c?.url || !/^https?:\/\//i.test(c.url)) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(c.url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      signal: ctrl.signal,
    });
    if (r.status === 404 || r.status === 410) return null; // clearly gone
    return c;
  } catch (e: any) {
    if (e?.name === "AbortError") return c; // slow but probably real
    const m = String(e?.message || e).toLowerCase();
    // Unresolvable host (likely fabricated domain) → drop. Other network blips → keep.
    if (/enotfound|getaddrinfo|could not resolve|name not resolved|dns|err_name/.test(m)) {
      return null;
    }
    return c;
  } finally {
    clearTimeout(t);
  }
}
