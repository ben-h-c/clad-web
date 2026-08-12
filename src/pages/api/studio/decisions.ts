/**
 * GET /api/studio/decisions — Mac pulls pending approve/changes from iPad.
 * After applying locally, Mac should POST status clear + call claim-consumed via status.
 */
import type { APIRoute } from "astro";
import {
  authorizeStudio,
  dequeueDecision,
  getMeta,
  json,
  listPendingDecisions,
  notConfigured,
  putMeta,
  relayConfigured,
  unauthorized,
} from "~/lib/studioRelay";

export const prerender = false;

export const OPTIONS: APIRoute = async () => json({ ok: true }, 204);

export const GET: APIRoute = async ({ request }) => {
  if (!relayConfigured()) return notConfigured();
  if (!authorizeStudio(request)) return unauthorized();

  const ids = await listPendingDecisions();
  const decisions: {
    ticketId: string;
    action: string;
    notes: string;
    at: string;
  }[] = [];

  for (const id of ids) {
    const meta = await getMeta(id);
    if (!meta?.pendingDecision) {
      await dequeueDecision(id);
      continue;
    }
    decisions.push({
      ticketId: id,
      action: meta.pendingDecision.action,
      notes: meta.pendingDecision.notes || "",
      at: meta.pendingDecision.at,
    });
  }

  return json({ ok: true, decisions, count: decisions.length });
};

/** POST /api/studio/decisions/ack { ticketId } — Mac finished applying decision */
export const POST: APIRoute = async ({ request }) => {
  if (!relayConfigured()) return notConfigured();
  if (!authorizeStudio(request)) return unauthorized();

  let body: { ticketId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  const id = String(body.ticketId || "");
  if (!id) return json({ ok: false, error: "ticketId required" }, 400);

  const meta = await getMeta(id);
  if (meta) {
    meta.pendingDecision = null;
    await putMeta(meta);
  }
  await dequeueDecision(id);
  return json({ ok: true });
};
