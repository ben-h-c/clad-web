/**
 * POST /api/studio/ticket/:id/decision — iPad approve / request changes / promote.
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
  const normalized =
    action === "request_changes"
      ? "changes"
      : action === "push_prod" || action === "push-to-prod" || action === "production"
        ? "promote"
        : action;
  if (normalized !== "approve" && normalized !== "changes" && normalized !== "promote") {
    return json({ ok: false, error: "action must be approve|changes|promote" }, 400);
  }

  meta.pendingDecision = {
    action: normalized,
    notes,
    at: new Date().toISOString(),
  };
  if (normalized === "approve") {
    meta.lastNote = notes || "Approved on iPad — waiting for Mac to implement on staging";
    meta.status = "implementing";
  } else if (normalized === "changes") {
    if (meta.status === "promoting") {
      return json({ ok: false, error: "cannot request changes while a production push is running" }, 409);
    }
    const fromStaging = meta.status === "shipped";
    meta.lastNote =
      notes ||
      (fromStaging
        ? "Changes requested on staging — waiting for Mac"
        : "Changes requested — waiting for Mac");
    meta.status = "changes_requested";
  } else {
    meta.lastNote = notes || "Push to production requested — waiting for Mac";
    meta.status = "promoting";
  }
  await putMeta(meta);
  await enqueueDecision(id);

  return json(publicTicketView(meta));
};
