import "server-only";

import {
  checkoutSessionParams,
  priceCentsFor,
  readPaidSession,
  seasonTaxYear,
  type PaidPlan,
  type PaidSession,
} from "@studio/core/billing";

import { BRAND } from "./brand";
import { serverEnv } from "./env";
import { getFirm } from "./firm-store";
import type { Session } from "./session";
import { adminClient } from "./supabase-admin";

/**
 * Buying a plan. The firm's owner is sent to Stripe Checkout; Stripe then
 * tells us about the payment twice over: through the signed webhook, and
 * when the buyer lands back on our site. Both end in `applyPaidSession`,
 * which the database makes safe to repeat.
 */

async function stripe(method: "GET" | "POST", path: string, body?: URLSearchParams): Promise<unknown> {
  const response = await fetch(`${serverEnv.stripeApiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${serverEnv.stripeSecretKey}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body?.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (json as { error?: { type?: string; code?: string } } | null)?.error;
    const what = `Stripe ${method} ${path.split("/").slice(0, 4).join("/")}`;
    throw new Error(`${what} returned ${response.status} ${error?.code ?? error?.type ?? ""}`.trim());
  }
  return json;
}

export type CheckoutStart =
  | { ok: true; url: string }
  | { ok: false; reason: "closed" | "no_firm" | "not_owner" | "nothing_to_buy" };

/** Create a Checkout Session for the signed-in owner's firm and return Stripe's page address. */
export async function startCheckout(session: Session, plan: PaidPlan): Promise<CheckoutStart> {
  if (!serverEnv.billingEnabled) return { ok: false, reason: "closed" };
  const firm = await getFirm(session.db);
  if (!firm) return { ok: false, reason: "no_firm" };
  if (firm.role !== "owner") return { ok: false, reason: "not_owner" };
  const amountCents = priceCentsFor(plan, firm.plan);
  if (amountCents === null) return { ok: false, reason: "nothing_to_buy" };

  const created = (await stripe(
    "POST",
    "/v1/checkout/sessions",
    checkoutSessionParams({
      orgId: firm.id,
      plan,
      taxYear: seasonTaxYear(new Date()),
      amountCents,
      brandName: BRAND.name,
      customerEmail: session.email,
      successUrl: `${serverEnv.appUrl}/dashboard/plan/confirm?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${serverEnv.appUrl}/dashboard/plan`,
    }),
  )) as { url?: unknown } | null;

  const url = typeof created?.url === "string" ? created.url : "";
  // Local tests use a stand-in for Stripe on plain http.
  const local = serverEnv.stripeApiUrl.startsWith("http://localhost") && url.startsWith("http://localhost");
  if (!url.startsWith("https://") && !local) {
    throw new Error("Stripe returned a Checkout Session without a page address");
  }
  return { ok: true, url };
}

/**
 * Record a payment Stripe has confirmed and raise the firm's limits.
 * Returns true when this call applied it, false when it was applied before.
 */
export async function applyPaidSession(paid: PaidSession): Promise<boolean> {
  const { data, error } = await adminClient().rpc("apply_plan_purchase", {
    p_org_id: paid.orgId,
    p_plan: paid.plan,
    p_tax_year: paid.taxYear,
    p_amount_cents: paid.amountCents,
    p_stripe_session_id: paid.sessionId,
    p_stripe_customer_id: paid.customerId,
  });
  if (error) throw new Error(`apply_plan_purchase failed: ${error.code} ${error.message}`);
  return data === true;
}

const SESSION_ID = /^cs_[A-Za-z0-9_]{8,250}$/;

/**
 * The buyer has come back from Stripe. Ask Stripe about the session and
 * apply it if it is paid, without waiting for the webhook. "pending" covers
 * a payment that has not cleared and anything that is not this firm's.
 */
export async function confirmCheckout(session: Session, sessionId: string): Promise<"paid" | "pending"> {
  if (!serverEnv.billingEnabled || !SESSION_ID.test(sessionId)) return "pending";
  const firm = await getFirm(session.db);
  if (!firm) return "pending";

  const paid = readPaidSession(await stripe("GET", `/v1/checkout/sessions/${sessionId}`));
  if (!paid || paid.orgId !== firm.id) return "pending";
  await applyPaidSession(paid);
  return "paid";
}

export type Purchase = { plan: string; taxYear: number; amountCents: number; purchasedAt: string };

export async function listPurchases(session: Session): Promise<Purchase[]> {
  const { data, error } = await session.db.rpc("firm_purchases");
  if (error) throw new Error(`firm_purchases failed: ${error.code} ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as Record<string, any>[]).map((row) => ({
    plan: row.plan,
    taxYear: row.tax_year,
    amountCents: row.amount_cents,
    purchasedAt: row.purchased_at,
  }));
}
