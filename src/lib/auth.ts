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
  if (a.length !== b.length) {
    // Still walk b.length bytes to avoid leaking the length, then return false.
    let acc = 1;
    for (let i = 0; i < b.length; i++) acc |= b.charCodeAt(i);
    return acc === 0;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
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
