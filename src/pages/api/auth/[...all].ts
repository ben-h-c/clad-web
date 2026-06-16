import type { APIRoute } from "astro";
import { getAuth } from "~/lib/auth-server";

export const prerender = false;

// Mount Better Auth's request handler for all /api/auth/* routes (sign-up,
// sign-in, sign-out, social callbacks, verification, password reset, etc.).
export const ALL: APIRoute = ({ request }) => getAuth().handler(request);
