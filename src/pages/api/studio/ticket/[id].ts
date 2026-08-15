/**
 * GET  /api/studio/ticket/:id — iPad/Mac: ticket status (mirrors LAN companion shape)
 * POST /api/studio/ticket/:id — Mac: push status + optional proposal markdown
 */
import type { APIRoute } from "astro";
import {
  authorizeStudio,
  getMeta,
  json,
  notConfigured,
  publicTicketView,
  putMeta,
  putPreview,
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
  if (!meta) return json({ ok: false, error: "ticket not found" }, 404);
  return json(publicTicketView(meta));
};

export const POST: APIRoute = async ({ request, params }) => {
  if (!relayConfigured()) return notConfigured();
  if (!authorizeStudio(request)) return unauthorized();

  const id = safeTicketId(params.id || "");
  const meta = await getMeta(id);
  if (!meta) return json({ ok: false, error: "ticket not found" }, 404);

  let body: Record<string, unknown> = {};
  const ct = request.headers.get("Content-Type") || "";
  try {
    if (ct.includes("application/json")) {
      body = (await request.json()) as Record<string, unknown>;
    } else if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      const statusRaw = form.get("status");
      if (typeof statusRaw === "string") {
        try {
          body = JSON.parse(statusRaw);
        } catch {
          body = { status: statusRaw };
        }
      }
      const preview = form.get("preview");
      if (preview && typeof preview === "object" && "arrayBuffer" in preview) {
        const buf = await (preview as File).arrayBuffer();
        if (buf.byteLength > 0 && buf.byteLength < 8_000_000) {
          await putPreview(id, buf);
          body.hasPreview = true;
        }
      }
    } else {
      body = (await request.json()) as Record<string, unknown>;
    }
  } catch {
    return json({ ok: false, error: "invalid body" }, 400);
  }

  if (typeof body.status === "string" && body.status) meta.status = body.status;
  if (typeof body.lastNote === "string") meta.lastNote = body.lastNote;
  if (typeof body.error === "string" || body.error === null) meta.error = body.error as string | null;
  if (typeof body.proposalMarkdown === "string") {
    meta.proposalMarkdown = body.proposalMarkdown;
    meta.hasProposal = true;
  }
  if (typeof body.hasProposal === "boolean") meta.hasProposal = body.hasProposal;
  if (typeof body.hasPreview === "boolean") meta.hasPreview = body.hasPreview;
  if (body.summary && typeof body.summary === "object") {
    meta.summary = body.summary as Record<string, unknown>;
  }
  if (typeof body.shipCommit === "string") meta.shipCommit = body.shipCommit;
  if (typeof body.shipUrl === "string") meta.shipUrl = body.shipUrl;
  if (typeof body.prodCommit === "string") meta.prodCommit = body.prodCommit;
  if (typeof body.prodUrl === "string") meta.prodUrl = body.prodUrl;
  if (typeof body.revision === "number") meta.revision = body.revision;
  if (Array.isArray(body.feedback)) meta.feedback = body.feedback;
  if (typeof body.claimedAt === "string") meta.claimedAt = body.claimedAt;

  // Optional base64 preview in JSON
  if (typeof body.previewBase64 === "string" && body.previewBase64.length > 0) {
    try {
      const bin = Uint8Array.from(atob(body.previewBase64), (c) => c.charCodeAt(0));
      if (bin.byteLength > 0 && bin.byteLength < 8_000_000) {
        await putPreview(id, bin.buffer);
        meta.hasPreview = true;
      }
    } catch {
      /* ignore bad preview */
    }
  }

  await putMeta(meta);
  return json(publicTicketView(meta));
};
