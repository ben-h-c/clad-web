import type { APIRoute } from "astro";
import { verifyWebhook, upsertSubscription, userIdForCustomer } from "~/lib/stripe";

export const prerender = false;

const ok = () => new Response(JSON.stringify({ received: true }), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

export const POST: APIRoute = async ({ request }) => {
  const payload = await request.text();
  const valid = await verifyWebhook(payload, request.headers.get("stripe-signature"));
  if (!valid) return new Response("bad signature", { status: 400 });

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const obj = event?.data?.object ?? {};
  const isoFromUnix = (s: any) => (typeof s === "number" ? new Date(s * 1000).toISOString() : null);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const userId = obj.client_reference_id || obj.metadata?.userId;
        if (userId) {
          await upsertSubscription({
            userId,
            status: "active",
            stripeCustomerId: obj.customer ?? null,
            stripeSubscriptionId: obj.subscription ?? null,
            currentPeriodEnd: null,
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const userId = obj.metadata?.userId || (obj.customer ? await userIdForCustomer(obj.customer) : null);
        if (userId) {
          const status = event.type === "customer.subscription.deleted" ? "canceled" : obj.status;
          const plan = obj.items?.data?.[0]?.price?.id ?? null;
          await upsertSubscription({
            userId,
            status: status || "none",
            plan,
            stripeCustomerId: obj.customer ?? null,
            stripeSubscriptionId: obj.id ?? null,
            currentPeriodEnd: isoFromUnix(obj.current_period_end),
          });
        }
        break;
      }
      default:
        break;
    }
  } catch {
    // Acknowledge anyway so Stripe doesn't hammer retries on a transient write
    // error; state reconciles on the next subscription.updated event.
    return ok();
  }

  return ok();
};
