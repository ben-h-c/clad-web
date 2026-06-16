import type { APIRoute } from "astro";
import {
  getSessionUser,
  listFavorites,
  addFavorite,
  removeFavorite,
  jsonResponse,
} from "~/lib/user-data";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);
  return jsonResponse({ favorites: await listFavorites(user.id) });
};

export const POST: APIRoute = async ({ request }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = String(body.slug ?? "").trim();
  if (!slug) return jsonResponse({ error: "slug required" }, 400);
  const favorite = !!body.favorite;
  if (favorite) await addFavorite(user.id, slug, String(body.headline ?? slug));
  else await removeFavorite(user.id, slug);
  return jsonResponse({ ok: true, favorite });
};
