import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { decodeJwsPayload, getAppleSubscriptionStatus, iapConfigured } from "~/lib/apple-iap";

export const prerender = false;

// App Store Server Notifications V2 webhook. Apple POSTs a signed payload on
// renewals, cancellations, refunds, expirations, etc. We don't trust the
// notification's contents — we use it only as a trigger: decode it to find the
// originalTransactionId, then re-query the authoritative status from Apple and
// update the stored entitlement. Always 200 so Apple doesn't retry forever.
export const POST: APIRoute = async ({ request }) => {
  if (!(await iapConfigured())) return new Response(null, { status: 200 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 200 });
  }

  const payload = decodeJwsPayload(body?.signedPayload);
  const txnInfo = decodeJwsPayload(payload?.data?.signedTransactionInfo);
  const originalTransactionId: string | undefined =
    txnInfo?.originalTransactionId ?? payload?.data?.originalTransactionId;
  if (!originalTransactionId) return new Response(null, { status: 200 });

  // Only act on subscriptions already linked to a user; the purchase-link
  // endpoint owns first-time association.
  const row = await env.DB.prepare(
    "SELECT userId FROM apple_subscription WHERE originalTransactionId = ?"
  )
    .bind(originalTransactionId)
    .first<{ userId: string }>();
  if (!row) return new Response(null, { status: 200 });

  const environment = payload?.data?.environment === "Sandbox" ? "sandbox" : "production";
  const status = await getAppleSubscriptionStatus(originalTransactionId, environment);
  if (status) {
    await env.DB.prepare(
      "UPDATE apple_subscription SET productId = ?, status = ?, expiresAt = ?, updatedAt = ? WHERE originalTransactionId = ?"
    )
      .bind(
        status.productId,
        status.active ? "active" : "expired",
        status.expiresAt,
        new Date().toISOString(),
        originalTransactionId
      )
      .run();
  }

  return new Response(null, { status: 200 });
};
