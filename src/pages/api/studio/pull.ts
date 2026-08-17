/**
 * GET /api/studio/pull — Mac companion polls for unclaimed packets.
 */
import type { APIRoute } from "astro";
import {
  authorizeStudio,
  getMeta,
  json,
  listPending,
  notConfigured,
  relayConfigured,
  unauthorized,
} from "~/lib/studioRelay";

export const prerender = false;

export const OPTIONS: APIRoute = async () => json({ ok: true }, 204);

export const GET: APIRoute = async ({ request }) => {
  if (!relayConfigured()) return notConfigured();
  if (!authorizeStudio(request)) return unauthorized();

  const pending = await listPending();
  const tickets: { ticketId: string; filename: string; updatedAt: string }[] = [];
  for (const id of pending) {
    const meta = await getMeta(id);
    if (!meta) continue;
    // Re-offer packets that were claimed then lost (download died after
    // dequeue). A live ticket is proposing+ and should not re-queue.
    const unfinished = !meta.status || meta.status === "received" || meta.status === "queued";
    if (meta.claimedAt && !unfinished) continue;
    if (!unfinished) continue;
    tickets.push({
      ticketId: meta.ticketId,
      filename: meta.filename,
      updatedAt: meta.updatedAt,
    });
  }

  return json({ ok: true, tickets, count: tickets.length });
};
