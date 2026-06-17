import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { setDiscover, type DiscoverSection } from "~/lib/agents";

export const prerender = false;

// The curator posts its invented collections (title + blurb + post ids).
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
  const raw = Array.isArray(payload?.sections) ? payload.sections : [];
  const sections: DiscoverSection[] = raw
    .map((s: any) => ({
      title: String(s?.title ?? "").trim(),
      blurb: String(s?.blurb ?? "").trim(),
      ids: Array.isArray(s?.ids) ? s.ids.map((v: unknown) => String(v)).filter(Boolean) : [],
    }))
    .filter((s: DiscoverSection) => s.title && s.ids.length >= 2);
  await setDiscover(env.AGENTS, sections);
  return json({ ok: true, sections: sections.length }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
