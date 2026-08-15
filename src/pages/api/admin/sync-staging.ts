import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  readStagingSyncMeta,
  syncStagingFromProd,
} from "~/lib/syncStagingFromProd";

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const GET: APIRoute = async () => {
  if (env.ENVIRONMENT !== "staging") {
    return json({ error: "Only available on staging." }, 404);
  }
  const last = await readStagingSyncMeta(env.AGENTS);
  return json({ ok: true, last, hasProdBinding: !!env.AGENTS_PROD });
};

export const POST: APIRoute = async () => {
  if (env.ENVIRONMENT !== "staging") {
    return json({ error: "Refusing to sync: not staging." }, 403);
  }
  const source = env.AGENTS_PROD;
  if (!source) {
    return json(
      { error: "AGENTS_PROD binding missing. Redeploy staging so it can read production KV." },
      503
    );
  }
  if (source === env.AGENTS) {
    return json({ error: "AGENTS_PROD and AGENTS are the same namespace — refusing." }, 500);
  }

  try {
    const result = await syncStagingFromProd(source, env.AGENTS);
    return json({ ok: true, ...result });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e).slice(0, 240) }, 502);
  }
};
