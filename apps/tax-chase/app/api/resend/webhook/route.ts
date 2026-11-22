import { readEmailEvent, verifySvixSignature } from "@studio/core/email-events";

import { serverEnv } from "@/lib/env";
import { adminClient } from "@/lib/supabase-admin";

/** News this recent about an email we cannot find yet may simply have beaten our own record of sending it. */
const SETTLE_MS = 2 * 60 * 1000;

/**
 * The email provider calls this when an address bounces or a recipient
 * marks an email as spam. The vendor is then taken out of the reminder
 * run and the firm sees why on its board. The body is checked against the
 * provider's signature before anything in it is believed.
 */
export async function POST(request: Request) {
  if (!serverEnv.emailWebhookEnabled) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  // The signature covers the exact bytes sent, so read the body as text.
  const rawBody = await request.text();
  const signed = verifySvixSignature(
    rawBody,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    serverEnv.resendWebhookSecret,
    Date.now() / 1000,
  );
  if (!signed) return Response.json({ error: "bad_signature" }, { status: 400 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "bad_body" }, { status: 400 });
  }

  const event = readEmailEvent(parsed);
  if (!event) return Response.json({ received: true });

  const { data, error } = await adminClient().rpc("record_w9_email_event", {
    p_provider_message_id: event.emailId,
    p_event: event.kind,
    p_recipient: event.recipient,
    p_detail: event.detail,
  });
  if (error) {
    console.error("Recording an email event failed:", error.code, error.message);
    // The provider sends it again after a failed delivery.
    return Response.json({ error: "record_failed" }, { status: 500 });
  }

  // Other emails are sent from the same account (sign-in codes, for one),
  // so an unknown email is normal. Ask for a retry only when the news is
  // so fresh that our own record of the send may not be written yet.
  if (data === "unknown" && event.happenedAt !== null && Date.now() - event.happenedAt < SETTLE_MS) {
    return Response.json({ error: "not_recorded_yet" }, { status: 503 });
  }
  return Response.json({ received: true, outcome: data });
}
