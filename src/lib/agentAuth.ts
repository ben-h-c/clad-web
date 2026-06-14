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
  if (a.length !== b.length) {
    let acc = 1;
    for (let i = 0; i < b.length; i++) acc |= b.charCodeAt(i);
    return acc === 0;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function tokenUnauthorized(): Response {
  return new Response(JSON.stringify({ error: "Invalid or missing agent token" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
