import { paidSessionFromEvent, verifyStripeSignature } from "@studio/core/billing";

import { applyPaidSession } from "@/lib/billing";
import { serverEnv } from "@/lib/env";

/**
 * Stripe calls this when a Checkout Session is paid. The body is checked
 * against Stripe's signature before anything in it is believed. Events for
 * other things sold on the same Stripe account are acknowledged and ignored.
 */
export async function POST(request: Request) {
  if (!serverEnv.billingEnabled || !process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  // The signature covers the exact bytes sent, so read the body as text.
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!verifyStripeSignature(rawBody, signature, serverEnv.stripeWebhookSecret, Date.now() / 1000)) {
    return Response.json({ error: "bad_signature" }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "bad_body" }, { status: 400 });
  }

  const paid = paidSessionFromEvent(event);
  if (!paid) return Response.json({ received: true });

  try {
    const applied = await applyPaidSession(paid);
    return Response.json({ received: true, applied });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`Applying paid session ${paid.sessionId} failed:`, message);
    // A firm that no longer exists will not come back: acknowledge it so
    // Stripe stops retrying, and leave the log line for a person to follow up.
    if (message.endsWith("unknown_org")) return Response.json({ received: true, applied: false });
    // Anything else may pass on a retry, which Stripe does for a failed delivery.
    return Response.json({ error: "apply_failed" }, { status: 500 });
  }
}
