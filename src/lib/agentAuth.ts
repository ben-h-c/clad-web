/**
 * Bearer-token check for the agent endpoints (/api/agent/*). The runner
 * authenticates with AGENT_TOKEN — separate from the editor's basic-auth so a
 * leaked runner token can't reach the human console and vice-versa.
 */
export function checkAgentToken(header: string | null, expected: string): boolean {
  if (!expected) return false;
  if (!header || !header.startsWith("Bearer ")) return false;
  return safeEqual(header.slice(7).trim(), expected);
}

function safeEqual(a: string, b: string): boolean {
  // Fold the length difference into the accumulator rather than branching on it,
  // so total comparison time doesn't depend on the expected token's length.
  // Out-of-range charCodeAt is NaN; `| 0` coerces it to 0. Same observable
  // result as before: true iff a and b are byte-identical.
  let diff = a.length ^ b.length;
  const n = a.length > b.length ? a.length : b.length;
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  return diff === 0;
}

export function tokenUnauthorized(): Response {
  return new Response(JSON.stringify({ error: "Invalid or missing agent token" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
