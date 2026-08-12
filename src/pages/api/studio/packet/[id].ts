/**
 * GET /api/studio/packet/:id — Mac downloads zip bytes.
 * POST /api/studio/packet/:id/claim — Mac claims ticket (optional; also via status).
 */
import type { APIRoute } from "astro";
import {
  authorizeStudio,
  dequeuePending,
  getMeta,
  getZip,
  json,
  notConfigured,
  putMeta,
  relayConfigured,
  safeTicketId,
  unauthorized,
} from "~/lib/studioRelay";

export const prerender = false;

export const OPTIONS: APIRoute = async () => json({ ok: true }, 204);

export const GET: APIRoute = async ({ request, params }) => {
  if (!relayConfigured()) return notConfigured();
  if (!authorizeStudio(request)) return unauthorized();

  const id = safeTicketId(params.id || "");
  if (!id) return json({ ok: false, error: "missing id" }, 400);
  const meta = await getMeta(id);
  if (!meta) return json({ ok: false, error: "not found" }, 404);

  const zip = await getZip(id, meta.zipChunks || 1);
  if (!zip) return json({ ok: false, error: "zip missing" }, 404);

  // Claim on download so other Macs (if any) skip
  if (!meta.claimedAt) {
    meta.claimedAt = new Date().toISOString();
    meta.status = meta.status === "received" ? "queued" : meta.status;
    meta.lastNote = "Claimed by Mac companion";
    await putMeta(meta);
    await dequeuePending(id);
  }

  return new Response(zip, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.byteLength),
      "Cache-Control": "no-store",
      "X-Clad-Filename": meta.filename || `${id}.zip`,
      "Access-Control-Allow-Origin": "*",
    },
  });
};
