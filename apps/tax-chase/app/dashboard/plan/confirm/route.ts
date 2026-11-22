import { redirect } from "next/navigation";

import { confirmCheckout } from "@/lib/billing";
import { getSession } from "@/lib/session";

/**
 * Where Stripe sends the buyer after paying. Applies the payment straight
 * away when Stripe confirms it, then shows the plan page. If anything goes
 * wrong here the webhook still applies the payment.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  let result: "paid" | "pending" = "pending";
  try {
    result = await confirmCheckout(session, sessionId);
  } catch (error) {
    console.error("Confirming a checkout failed:", error instanceof Error ? error.message : "unknown error");
  }
  redirect(`/dashboard/plan?payment=${result}`);
}
