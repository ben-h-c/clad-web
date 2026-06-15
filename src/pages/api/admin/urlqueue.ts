import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getUrlQueue, enqueueUrls, dequeueUrls, existingVideoIds, isSeen } from "~/lib/agents";
import { extractVideoId } from "~/lib/youtube";

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

  // Ignore anything already published, already processed (seen ledger), or
  // already queued — so re-pasting the same links (Dispatch doesn't track what
  // it sent) is a no-op and never re-runs a transcript/Grok pass.
  const published = await existingVideoIds();
  const queuedVids = new Set(
    (await getUrlQueue(env.AGENTS)).map((u) => extractVideoId(u)).filter(Boolean) as string[]
  );
  const batchVids = new Set<string>();
  const accepted: string[] = [];
  let skippedDone = 0;
  for (const u of urls) {
    const vid = extractVideoId(u);
    if (!vid || batchVids.has(vid)) continue; // invalid or dup within this paste
    batchVids.add(vid);
    if (published.has(vid) || queuedVids.has(vid) || (await isSeen(env.AGENTS, vid))) {
      skippedDone++;
      continue;
    }
    accepted.push(u);
  }

  const list = accepted.length ? await enqueueUrls(env.AGENTS, accepted) : await getUrlQueue(env.AGENTS);
  return json({ ok: true, added: accepted.length, skipped: skippedDone, total: list.length }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
