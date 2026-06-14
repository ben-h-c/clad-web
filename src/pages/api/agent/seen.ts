import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { existingVideoIds, isSeen, getDraft, draftId, findDuplicateStory } from "~/lib/agents";

export const prerender = false;

// Pre-filter for the runner: returns which candidate video ids are already
// known — published, pending, in the seen-ledger, OR the same story already
// covered by the same network (so we skip before spending transcript + xAI
// budget). Accepts either `candidates: [{videoId, channel, title}]` (preferred,
// enables same-network story dedup) or a plain `videoIds: []`.
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

  const agentId = String(payload?.agentId ?? "").trim();
  const candidates: { videoId: string; channel?: string; title?: string }[] =
    Array.isArray(payload?.candidates)
      ? payload.candidates
          .map((c: any) => ({
            videoId: String(c?.videoId ?? "").trim(),
            channel: c?.channel ? String(c.channel) : "",
            title: c?.title ? String(c.title) : "",
          }))
          .filter((c: any) => c.videoId)
      : Array.isArray(payload?.videoIds)
      ? payload.videoIds.map((v: unknown) => ({ videoId: String(v) })).filter((c: any) => c.videoId)
      : [];

  const published = await existingVideoIds();
  const known: string[] = [];
  for (const c of candidates) {
    if (published.has(c.videoId)) {
      known.push(c.videoId);
      continue;
    }
    if (await isSeen(env.AGENTS, c.videoId)) {
      known.push(c.videoId);
      continue;
    }
    if (agentId && (await getDraft(env.AGENTS, draftId(agentId, c.videoId)))) {
      known.push(c.videoId);
      continue;
    }
    // Same network already ran this story (different video id)?
    if (c.channel && c.title) {
      const dup = await findDuplicateStory(env.AGENTS, {
        channel: c.channel,
        texts: [c.title],
        includeDrafts: true,
      });
      if (dup) known.push(c.videoId);
    }
  }

  return json({ known }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
