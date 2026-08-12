/**
 * POST /api/studio/packet — iPad uploads a Design Packet zip to the cloud relay.
 * Authorization: Bearer CLAD_STUDIO_RELAY_TOKEN
 * Body: application/zip
 * Header: X-Clad-Filename (optional)
 */
import type { APIRoute } from "astro";
import {
  authorizeStudio,
  enqueuePending,
  json,
  MAX_ZIP_BYTES,
  notConfigured,
  putMeta,
  putZip,
  relayConfigured,
  safeTicketId,
  unauthorized,
} from "~/lib/studioRelay";

export const prerender = false;

export const OPTIONS: APIRoute = async () =>
  json({ ok: true }, 204);

export const POST: APIRoute = async ({ request }) => {
  if (!relayConfigured()) return notConfigured();
  if (!authorizeStudio(request)) return unauthorized();

  const data = await request.arrayBuffer();
  if (!data.byteLength) return json({ ok: false, error: "empty body" }, 400);
  if (data.byteLength > MAX_ZIP_BYTES) {
    return json(
      {
        ok: false,
        error: `Packet too large (${Math.round(data.byteLength / 1024 / 1024)}MB). Max ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)}MB.`,
      },
      413
    );
  }

  let filename =
    request.headers.get("X-Clad-Filename") ||
    `ticket-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  filename = safeTicketId(filename);
  if (!filename.endsWith(".zip")) filename += ".zip";
  const ticketId = safeTicketId(filename.replace(/\.zip$/i, ""));

  const chunks = await putZip(ticketId, data);
  const now = new Date().toISOString();
  await putMeta({
    ticketId,
    filename,
    status: "received",
    updatedAt: now,
    lastNote: "In cloud relay — waiting for Mac companion",
    hasProposal: false,
    hasPreview: false,
    zipChunks: chunks,
    claimedAt: null,
    pendingDecision: null,
  });
  await enqueuePending(ticketId);

  return json({
    ok: true,
    ticketId,
    status: "received",
    queuePosition: 0,
    transport: "cloud",
    poll: `/api/studio/ticket/${encodeURIComponent(ticketId)}`,
  });
};
