/**
 * POST /api/studio/ticket/:id/decision — iPad approve / request changes.
 * Mac companion pulls decisions via GET /api/studio/decisions.
 */
import type { APIRoute } from "astro";
import {
  authorizeStudio,
  enqueueDecision,
  getMeta,
  json,
  notConfigured,
  publicTicketView,
  putMeta,
  relayConfigured,
  safeTicketId,
  unauthorized,
} from "~/lib/studioRelay";

export const prerender = false;

export const OPTIONS: APIRoute = async () => json({ ok: true }, 204);

export const POST: APIRoute = async ({ request, params }) => {
  if (!relayConfigured()) return notConfigured();
  if (!authorizeStudio(request)) return unauthorized();

  const id = safeTicketId(params.id || "");
  const meta = await getMeta(id);
  if (!meta) return json({ ok: false, error: "ticket not found" }, 404);

  let body: { action?: string; notes?: string } = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  const action = String(body.action || "").toLowerCase();
  const notes = String(body.notes || "").trim();
  if (action !== "approve" && action !== "changes" && action !== "request_changes") {
    return json({ ok: false, error: "action must be approve|changes" }, 400);
  }

  const normalized = action === "request_changes" ? "changes" : action;
  meta.pendingDecision = {
    action: normalized,
    notes,
    at: new Date().toISOString(),
  };
  meta.lastNote =
    normalized === "approve"
      ? notes || "Approved on iPad — waiting for Mac to implement"
      : notes || "Changes requested — waiting for Mac";
  // Optimistic status so UI updates immediately; Mac will refine
  meta.status = normalized === "approve" ? "implementing" : "changes_requested";
  await putMeta(meta);
  await enqueueDecision(id);

  return json(publicTicketView(meta));
};
