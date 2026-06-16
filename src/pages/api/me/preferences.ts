import type { APIRoute } from "astro";
import { getSessionUser, getPrefs, setPrefs, sanitizePrefs, jsonResponse } from "~/lib/user-data";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);
  return jsonResponse({ prefs: await getPrefs(user.id) });
};

export const POST: APIRoute = async ({ request }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);
  const body = await request.json().catch(() => ({}));
  const prefs = sanitizePrefs(body);
  await setPrefs(user.id, prefs);
  return jsonResponse({ ok: true, prefs });
};
