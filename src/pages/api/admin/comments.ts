import type { APIRoute } from "astro";
import { jsonResponse, deleteCommentById } from "~/lib/user-data";

export const prerender = false;

// DELETE /api/admin/comments  { id }  — editor moderation. This route sits
// under /api/, so src/middleware.ts gates it behind the editor basic-auth
// credential; no per-route auth check is needed.
export const DELETE: APIRoute = async ({ request }) => {
  let p: any;
  try {
    p = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
  const id = String(p?.id ?? "").trim();
  if (!id) return jsonResponse({ error: "id required" }, 400);
  await deleteCommentById(id);
  return jsonResponse({ ok: true });
};
