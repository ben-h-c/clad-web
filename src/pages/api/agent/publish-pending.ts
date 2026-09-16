import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAgentToken, tokenUnauthorized } from "~/lib/agentAuth";
import { autoApproveEnabled } from "~/lib/autoApprove";
import { kickPendingPublish } from "~/pages/api/admin/queue";
import { listDrafts } from "~/lib/agents";

export const prerender = false;

/** Drain the pending queue (auto-approve). Used after deploy and by the runner. */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!checkAgentToken(request.headers.get("authorization"), env.AGENT_TOKEN)) {
    return tokenUnauthorized();
  }
  if (!autoApproveEnabled(env)) {
    return json({ ok: false, reason: "auto-approve-off" }, 200);
  }
  const pending = (await listDrafts(env.AGENTS)).length;
  kickPendingPublish(request, locals);
  return json({ ok: true, pending }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
