import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getSessionUser } from "~/lib/user-data";
import { getAppleSubscriptionStatus, iapConfigured } from "~/lib/apple-iap";

export const prerender = false;

// The iOS app POSTs here after a StoreKit purchase/restore to link the Apple
// subscription to the signed-in account. We ignore the client's claims and
// ask Apple's App Store Server API for the authoritative status, then store
// the entitlement so getAccess() unlocks Premium in the app, web, and widget.
//
// Body: { originalTransactionId: string, environment?: "sandbox"|"production" }
export const POST: APIRoute = async ({ request }) => {
  if (!(await iapConfigured())) return json({ error: "In-app purchase is not configured." }, 503);

  const user = await getSessionUser(request.headers);
  if (!user) return json({ error: "Sign in required." }, 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const originalTransactionId =
    typeof body?.originalTransactionId === "string" ? body.originalTransactionId.trim() : "";
  if (!/^[0-9]{6,40}$/.test(originalTransactionId)) {
    return json({ error: "Invalid transaction id" }, 400);
  }
  const environment = body?.environment === "sandbox" ? "sandbox" : "production";

  const status = await getAppleSubscriptionStatus(originalTransactionId, environment);
  if (!status) return json({ error: "Could not verify the purchase with Apple." }, 502);

  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO apple_subscription (userId, originalTransactionId, productId, status, expiresAt, updatedAt) " +
      "VALUES (?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(userId) DO UPDATE SET " +
      "originalTransactionId = excluded.originalTransactionId, productId = excluded.productId, " +
      "status = excluded.status, expiresAt = excluded.expiresAt, updatedAt = excluded.updatedAt"
  )
    .bind(
      user.id,
      originalTransactionId,
      status.productId,
      status.active ? "active" : "expired",
      status.expiresAt,
      now
    )
    .run();

  return json({ ok: true, active: status.active, expiresAt: status.expiresAt }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
