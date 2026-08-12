/**
 * GET /api/studio/health — probe (requires bearer when configured).
 */
import type { APIRoute } from "astro";
import {
  authorizeStudio,
  json,
  notConfigured,
  relayConfigured,
  unauthorized,
} from "~/lib/studioRelay";

export const prerender = false;

export const OPTIONS: APIRoute = async () => json({ ok: true }, 204);

export const GET: APIRoute = async ({ request }) => {
  if (!relayConfigured()) return notConfigured();
  if (!authorizeStudio(request)) return unauthorized();
  return json({
    ok: true,
    service: "cladstudio-relay",
    transport: "cloud",
  });
};
