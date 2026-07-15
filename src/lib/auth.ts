/**
 * Basic-auth check used by the middleware. One editor (Ben), so a single
 * shared credential is enough — but we still use a constant-time compare
 * so the secret can't be brute-forced by timing.
 */
export function checkBasicAuth(
  header: string | null,
  expectedUser: string,
  expectedPassword: string
): boolean {
  if (!header || !header.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;
  const user = decoded.slice(0, idx);
  const pass = decoded.slice(idx + 1);
  return safeEqual(user, expectedUser) && safeEqual(pass, expectedPassword);
}

function safeEqual(a: string, b: string): boolean {
  // Fold the length difference into the accumulator rather than branching on it,
  // so total comparison time doesn't depend on the expected value's length.
  // Out-of-range charCodeAt is NaN; `| 0` coerces it to 0. Same observable
  // result as before: true iff a and b are byte-identical.
  let diff = a.length ^ b.length;
  const n = a.length > b.length ? a.length : b.length;
  for (let i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}

export function unauthorized(): Response {
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Clad Admin", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
