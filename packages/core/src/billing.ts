import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paid plans and the Stripe Checkout plumbing for buying one.
 *
 * A plan is a one-time payment for a 1099 season. The server creates a
 * Checkout Session, Stripe takes the payment, and Stripe tells the server
 * through a signed webhook. Nothing here talks to the network: this module
 * builds the request, checks the signature and reads the result.
 */

export type PaidPlan = "season" | "firm";

export const PLANS: Record<
  PaidPlan,
  { name: string; priceCents: number; businessLimit: number; summary: string }
> = {
  season: {
    name: "Season",
    priceCents: 14_900,
    businessLimit: 25,
    summary: "Up to 25 client businesses, with no limit on vendors.",
  },
  firm: {
    name: "Firm",
    priceCents: 29_900,
    businessLimit: 100,
    summary: "Up to 100 client businesses, with no limit on vendors.",
  },
};

/** Marks a Checkout Session as ours, since a Stripe account can sell other things. */
export const CHECKOUT_PRODUCT = "w9-chase-plan";

export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "season" || value === "firm";
}

/** The name to show for whatever is stored as a firm's plan. */
export function planName(plan: string): string {
  return isPaidPlan(plan) ? PLANS[plan].name : "Free";
}

/**
 * What a firm pays for a plan today, or null when it has nothing to gain
 * from it. A firm on Season pays only the difference to move up to Firm.
 */
export function priceCentsFor(plan: PaidPlan, currentPlan: string): number | null {
  if (currentPlan === "firm") return null;
  if (currentPlan === "season") {
    return plan === "firm" ? PLANS.firm.priceCents - PLANS.season.priceCents : null;
  }
  return PLANS[plan].priceCents;
}

/** The 1099 season being worked on: last year's payments until April, then this year's. */
export function seasonTaxYear(now: Date): number {
  return now.getUTCMonth() < 3 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export type CheckoutRequest = {
  orgId: string;
  plan: PaidPlan;
  taxYear: number;
  amountCents: number;
  /** Shown on Stripe's page and on the receipt, for example "FormStickler". */
  brandName: string;
  customerEmail: string | null;
  /** Where Stripe sends the buyer afterwards. Stripe fills in the session id. */
  successUrl: string;
  cancelUrl: string;
};

/**
 * The form fields for Stripe's "create a Checkout Session" call. The price
 * is set here, on the server, so the buyer cannot change it.
 */
export function checkoutSessionParams(request: CheckoutRequest): URLSearchParams {
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(request.amountCents));
  params.set(
    "line_items[0][price_data][product_data][name]",
    `${request.brandName} ${PLANS[request.plan].name} plan, ${request.taxYear} 1099 season`,
  );
  params.set("success_url", request.successUrl);
  params.set("cancel_url", request.cancelUrl);
  params.set("client_reference_id", request.orgId);
  params.set("metadata[product]", CHECKOUT_PRODUCT);
  params.set("metadata[org_id]", request.orgId);
  params.set("metadata[plan]", request.plan);
  params.set("metadata[tax_year]", String(request.taxYear));
  if (request.customerEmail) params.set("customer_email", request.customerEmail);
  return params;
}

/**
 * True when a webhook really came from Stripe. The `Stripe-Signature`
 * header carries a timestamp `t` and one or more `v1` signatures, each an
 * HMAC-SHA256 of `${t}.${rawBody}` with the endpoint's signing secret.
 * Old timestamps are refused so a captured request cannot be replayed.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): boolean {
  if (!header || !secret) return false;

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const at = part.indexOf("=");
    if (at === -1) continue;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return signatures.some((signature) => {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
    return timingSafeEqual(Buffer.from(signature, "hex"), expected);
  });
}

export type PaidSession = {
  sessionId: string;
  orgId: string;
  plan: PaidPlan;
  taxYear: number;
  amountCents: number;
  customerId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Read a Checkout Session from Stripe. Returns the purchase only when the
 * session is one of ours, is fully paid in US dollars, and was paid at a
 * price we charge for that plan. Anything else returns null and must not
 * change a firm's plan.
 */
export function readPaidSession(session: unknown): PaidSession | null {
  if (typeof session !== "object" || session === null) return null;
  const s = session as Record<string, unknown>;
  const metadata = (typeof s.metadata === "object" && s.metadata !== null ? s.metadata : {}) as Record<
    string,
    unknown
  >;

  if (typeof s.id !== "string" || s.id === "") return null;
  if (s.mode !== "payment" || s.payment_status !== "paid" || s.currency !== "usd") return null;
  if (metadata.product !== CHECKOUT_PRODUCT) return null;

  const orgId = metadata.org_id;
  const plan = metadata.plan;
  const taxYear = Number(metadata.tax_year);
  const amountCents = s.amount_total;
  if (typeof orgId !== "string" || !UUID.test(orgId)) return null;
  if (!isPaidPlan(plan)) return null;
  if (!Number.isInteger(taxYear) || taxYear < 2024 || taxYear > 2100) return null;
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents)) return null;

  // The full price, or the difference for a firm moving up from Season.
  const allowed = [PLANS[plan].priceCents];
  if (plan === "firm") allowed.push(PLANS.firm.priceCents - PLANS.season.priceCents);
  if (!allowed.includes(amountCents)) return null;

  return {
    sessionId: s.id,
    orgId,
    plan,
    taxYear,
    amountCents,
    customerId: typeof s.customer === "string" ? s.customer : null,
  };
}

/** The Checkout Session inside a webhook event that means "this was paid", or null. */
export function paidSessionFromEvent(event: unknown): PaidSession | null {
  if (typeof event !== "object" || event === null) return null;
  const e = event as { type?: unknown; data?: { object?: unknown } };
  if (
    e.type !== "checkout.session.completed" &&
    e.type !== "checkout.session.async_payment_succeeded"
  ) {
    return null;
  }
  return readPaidSession(e.data?.object);
}
