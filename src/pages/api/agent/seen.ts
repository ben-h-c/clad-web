import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { existingVideoIds, isSeen, getDraft, draftId } from "~/lib/agents";

export const prerender = false;

// Given candidate video ids, return which are already known (published,
// pending as a draft, or in the seen-ledger) so the runner can skip them
// before spending transcript + xAI budget.
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

  const videoIds: string[] = Array.isArray(payload?.videoIds)
    ? payload.videoIds.map((v: unknown) => String(v)).filter(Boolean)
    : [];
  const agentId = String(payload?.agentId ?? "").trim();

  const published = await existingVideoIds();
  const known: string[] = [];
  for (const id of videoIds) {
    if (published.has(id)) {
      known.push(id);
      continue;
    }
    if (await isSeen(env.AGENTS, id)) {
      known.push(id);
      continue;
    }
    if (agentId && (await getDraft(env.AGENTS, draftId(agentId, id)))) {
      known.push(id);
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
