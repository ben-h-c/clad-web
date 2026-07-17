import type { APIRoute } from "astro";
import {
  getSessionUser,
  getPrefs,
  setPrefs,
  mergePrefs,
  sanitizeBirthday,
  jsonResponse,
  MIN_ACCOUNT_AGE,
} from "~/lib/user-data";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);
  return jsonResponse({ prefs: await getPrefs(user.id) });
};

export const POST: APIRoute = async ({ request }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // Merge with existing prefs so partial updates (e.g. theme-only) don't wipe email settings.
  const current = await getPrefs(user.id);
  if ("birthday" in body && body.birthday != null && body.birthday !== "") {
    if (!sanitizeBirthday(body.birthday)) {
      return jsonResponse(
        {
          error: `Enter a valid birthday. You must be at least ${MIN_ACCOUNT_AGE} years old.`,
        },
        400
      );
    }
  }
  const prefs = mergePrefs(current, body);
  await setPrefs(user.id, prefs);
  return jsonResponse({ ok: true, prefs });
};
