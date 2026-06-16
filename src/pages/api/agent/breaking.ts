import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { getBreaking, setBreaking, type BreakingItem } from "~/lib/agents";

export const prerender = false;

// Read the current Breaking strip (so the curator can apply stickiness — only
// swap in a story that's significantly more important than what's already up).
export const GET: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  const items = await getBreaking(env.AGENTS);
  return json({ ok: true, items }, 200);
};

// The breaking-news curator posts the ordered list of items (single posts or
// same-story groups) to feature in the Breaking News strip.
export const POST: APIRoute = async ({ request }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  // Accept the new items shape; fall back to a plain id list for compatibility.
  let items: BreakingItem[] = [];
  if (Array.isArray(payload?.items)) {
    items = payload.items
      .map((it: any): BreakingItem | null => {
        if (it?.type === "group" && Array.isArray(it.ids) && it.ids.length) {
          return {
            type: "group",
            slug: String(it.slug || "").slice(0, 80),
            title: String(it.title || "").slice(0, 160),
            topic: it.topic ? String(it.topic).slice(0, 80) : undefined,
            ids: it.ids.map((v: unknown) => String(v)).filter(Boolean),
          };
        }
        const id = String(it?.id ?? it ?? "").trim();
        return id ? { type: "post", id } : null;
      })
      .filter((x: BreakingItem | null): x is BreakingItem => x !== null);
  } else if (Array.isArray(payload?.ids)) {
    items = payload.ids.map((v: unknown) => ({ type: "post", id: String(v) })).filter((x: any) => x.id);
  }
  await setBreaking(env.AGENTS, items);
  return json({ ok: true, count: items.length }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
