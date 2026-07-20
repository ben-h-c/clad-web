import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  buildCampaignFromClient,
  deleteCampaign,
  generateCampaign,
  getCampaigns,
  putCampaign,
  sanitizeInput,
} from "~/lib/campaign";

export const prerender = false;

export const GET: APIRoute = async () => {
  return json({ campaigns: await getCampaigns(env.AGENTS) }, 200);
};

export const POST: APIRoute = async ({ request }) => {
  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const action = String(p?.action ?? "");

  switch (action) {
    case "generate": {
      if (!env.XAI_API_KEY) return json({ error: "XAI_API_KEY not configured" }, 503);
      const rl = await rateLimit(request);
      if (rl) return rl;
      const input = sanitizeInput(p);
      if (!input.brief) return json({ error: "brief is required" }, 400);
      if (!input.platforms.length) return json({ error: "pick at least one platform" }, 400);
      try {
        const draft = await generateCampaign(env.XAI_API_KEY, input);
        return json({ draft, input }, 200);
      } catch (err: any) {
        return json({ error: err?.message ?? "Generation failed" }, 502);
      }
    }

    case "save": {
      try {
        const c = await buildCampaignFromClient(env.AGENTS, p);
        if (!c.card.headline) return json({ error: "card headline required" }, 400);
        const saved = await putCampaign(env.AGENTS, c);
        return json({ id: saved.id, updatedAt: saved.updatedAt, campaign: saved }, 200);
      } catch (err: any) {
        return json({ error: err?.message ?? "Save failed" }, 500);
      }
    }

    case "delete": {
      const id = String(p?.id ?? "").trim();
      if (!id) return json({ error: "id required" }, 400);
      await deleteCampaign(env.AGENTS, id);
      return json({ ok: true }, 200);
    }

    case "illustration": {
      // PHASE 2 — stub, secret-gated
      if (!env.XAI_API_KEY) return json({ error: "XAI_API_KEY not configured" }, 503);
      if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.GITHUB_BRANCH) {
        return json({ error: "GitHub not configured" }, 503);
      }
      const rl = await rateLimit(request);
      if (rl) return rl;
      // generateCampaignArt → commitBinaryFile(public/generated/campaign-<id>.png) → putCampaign(illustrationPath)
      return json({ error: "Illustration not enabled" }, 501);
    }

    case "post-bluesky": {
      // PHASE 3 — stub, secret-gated
      if (!env.BSKY_HANDLE || !env.BSKY_APP_PASSWORD) {
        return json({ error: "Bluesky not configured" }, 503);
      }
      // load stored campaign → renderCampaignCard() in-process → postToBluesky()
      return json({ error: "Bluesky posting not enabled" }, 501);
    }

    default:
      return json(
        { error: "action must be one of generate|save|delete|illustration|post-bluesky" },
        400
      );
  }
};

/**
 * Rate-limit once per owner request (never per xAI subcall).
 * campaign: key prefix so we never share a bucket with public factcheck: keys.
 */
async function rateLimit(request: Request): Promise<Response | null> {
  const limiter = env.CAMPAIGN_LIMITER ?? env.FACTCHECK_LIMITER;
  if (!limiter) return null;
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const perIp = await limiter.limit({ key: `campaign:${ip}` });
  const global = perIp.success ? await limiter.limit({ key: "campaign" }) : perIp;
  if (!perIp.success || !global.success) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Try again in a minute." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      }
    );
  }
  return null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
