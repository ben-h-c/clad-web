import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { setGoodNews, type GoodNewsSection } from "~/lib/agents";

export const prerender = false;

// The Good News curator posts its positive collections (title + blurb + post ids).
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
  const sections: GoodNewsSection[] = raw
    .map((s: any) => ({
      title: String(s?.title ?? "").trim(),
      blurb: String(s?.blurb ?? "").trim(),
      ids: Array.isArray(s?.ids) ? s.ids.map((v: unknown) => String(v)).filter(Boolean) : [],
    }))
    .filter((s: GoodNewsSection) => s.title && s.ids.length >= 2);
  await setGoodNews(env.AGENTS, sections);
  return json({ ok: true, sections: sections.length }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
