/**
 * Same-origin return paths for login/register funnels.
 * Rejects open redirects (//evil, protocol-relative, absolute URLs).
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = "/account/"
): string {
  if (!raw) return fallback;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return fallback;
  if (t.includes("://") || t.includes("\\")) return fallback;
  // Block admin / API / auth loops
  if (t.startsWith("/api/") || t.startsWith("/admin")) return fallback;
  return t.slice(0, 500);
}

/** Encode for use in ?next= query params. */
export function nextQuery(path: string): string {
  return `next=${encodeURIComponent(safeNextPath(path, path))}`;
}

export function registerHref(returnTo: string): string {
  return `/register/?${nextQuery(returnTo)}`;
}

export function loginHref(returnTo: string): string {
  return `/login/?${nextQuery(returnTo)}`;
}
