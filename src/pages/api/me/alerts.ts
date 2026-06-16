import type { APIRoute } from "astro";
import {
  getSessionUser,
  listAlerts,
  addAlert,
  removeAlert,
  jsonResponse,
} from "~/lib/user-data";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);
  return jsonResponse({ alerts: await listAlerts(user.id) });
};

export const POST: APIRoute = async ({ request }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  if (action === "add") {
    const topic = String(body.topic ?? "");
    const alert = await addAlert(user.id, topic);
    if (!alert) return jsonResponse({ error: "empty or duplicate topic" }, 400);
    return jsonResponse({ ok: true, alert });
  }
  if (action === "remove") {
    const id = String(body.id ?? "");
    if (!id) return jsonResponse({ error: "id required" }, 400);
    await removeAlert(user.id, id);
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: "unknown action" }, 400);
};
