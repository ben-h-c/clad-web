import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getUrlQueue, enqueueUrls, dequeueUrls } from "~/lib/agents";

export const prerender = false;

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)[\w-]{11}/;

export const GET: APIRoute = async () => {
  return json({ urls: await getUrlQueue(env.AGENTS) }, 200);
};

export const POST: APIRoute = async ({ request }) => {
  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (p?.remove) {
    const list = await dequeueUrls(env.AGENTS, Array.isArray(p.remove) ? p.remove : [p.remove]);
    return json({ ok: true, remaining: list.length }, 200);
  }

  // Accept either an array or a newline/space-separated blob; keep only things
  // that look like YouTube links.
  const raw: string[] = Array.isArray(p?.urls)
    ? p.urls.map(String)
    : String(p?.urls ?? "").split(/[\s,]+/);
  const urls = raw.map((u) => u.trim()).filter((u) => YT_RE.test(u));
  if (urls.length === 0) return json({ error: "No valid YouTube URLs found" }, 400);

  const list = await enqueueUrls(env.AGENTS, urls);
  return json({ ok: true, added: urls.length, total: list.length }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
