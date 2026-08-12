/**
 * GET /api/studio/ticket/:id/preview — PNG for design loop UI.
 */
import type { APIRoute } from "astro";
import {
  authorizeStudio,
  getMeta,
  getPreview,
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
  const meta = await getMeta(id);
  if (!meta) return json({ ok: false, error: "not found" }, 404);

  const png = await getPreview(id);
  if (!png) {
    return new Response("no preview", { status: 404 });
  }
  return new Response(png, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.byteLength),
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
