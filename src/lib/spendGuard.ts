import { env } from "cloudflare:workers";

/** Staging never spends xAI unless the caller opts in. Production is always allowed. */
export function isStagingEnv(): boolean {
  return env.ENVIRONMENT === "staging";
}

export function spendGranted(request: Request, body?: unknown): boolean {
  if (!isStagingEnv()) return true;
  const header = request.headers.get("x-clad-allow-spend")?.trim().toLowerCase();
  if (header === "1" || header === "true" || header === "yes") return true;
  try {
    const q = new URL(request.url).searchParams.get("spend")?.trim().toLowerCase();
    if (q === "1" || q === "true" || q === "yes") return true;
  } catch {
    /* ignore */
  }
  if (body && typeof body === "object" && (body as { allowSpend?: unknown }).allowSpend === true) {
    return true;
  }
  return false;
}

export function getXaiApiKey(request: Request, body?: unknown): string | undefined {
  const key = env.XAI_API_KEY;
  if (!key) return undefined;
  if (!spendGranted(request, body)) return undefined;
  return key;
}

export function xaiUnavailableMessage(): string {
  if (!env.XAI_API_KEY) return "XAI_API_KEY not configured";
  if (isStagingEnv()) {
    return "Staging does not spend xAI tokens unless you opt in (banner checkbox, allowSpend: true, or X-Clad-Allow-Spend: 1).";
  }
  return "XAI_API_KEY not configured";
}
