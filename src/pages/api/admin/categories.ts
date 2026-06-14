import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getSearchCategories, setSearchCategories, type SearchCategory } from "~/lib/agents";

export const prerender = false;

export const GET: APIRoute = async () => {
  const categories = await getSearchCategories(env.AGENTS);
  return json({ categories }, 200);
};

export const POST: APIRoute = async ({ request }) => {
  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!Array.isArray(p?.categories)) return json({ error: "categories array required" }, 400);

  const list: SearchCategory[] = p.categories.map((c: any) => ({
    id:
      String(c?.id || "").trim() ||
      String(c?.label || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40),
    label: String(c?.label || "").trim(),
    group: String(c?.group || "Custom").trim() || "Custom",
    enabled: Boolean(c?.enabled),
  }));

  await setSearchCategories(env.AGENTS, list);
  const enabled = list.filter((c) => c.enabled && c.label).length;
  return json({ ok: true, total: list.length, enabled }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
