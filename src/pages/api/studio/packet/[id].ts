/**
 * GET /api/studio/packet/:id — Mac downloads zip bytes.
 * POST /api/studio/packet/:id/claim — Mac claims ticket (optional; also via status).
 */
import type { APIRoute } from "astro";
import {
  authorizeStudio,
  getMeta,
  getZip,
  json,
  notConfigured,
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

  // Do not claim here. A GET that dies mid-download used to dequeue the
  // packet and leave the iPad on "queued" with no Mac copy. Claim happens
  // after the companion writes the zip and POSTs ticket status.

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
