import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CHECKOUT_PRODUCT,
  checkoutSessionParams,
  formatUsd,
  isPaidPlan,
  paidSessionFromEvent,
  planName,
  priceCentsFor,
  readPaidSession,
  seasonTaxYear,
  verifyStripeSignature,
} from "./billing";

const ORG = "3f2b8f0e-5c0a-4a52-9d0e-0f4f1c1f2a11";

describe("plans", () => {
  it("knows the paid plans", () => {
    expect(isPaidPlan("season")).toBe(true);
    expect(isPaidPlan("firm")).toBe(true);
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan(undefined)).toBe(false);
  });

  it("names whatever is stored", () => {
    expect(planName("free")).toBe("Free");
    expect(planName("season")).toBe("Season");
    expect(planName("firm")).toBe("Firm");
    expect(planName("something else")).toBe("Free");
  });

  it("charges full price from the free plan", () => {
    expect(priceCentsFor("season", "free")).toBe(14_900);
    expect(priceCentsFor("firm", "free")).toBe(29_900);
  });

  it("charges only the difference to move up from Season", () => {
    expect(priceCentsFor("firm", "season")).toBe(15_000);
    expect(priceCentsFor("season", "season")).toBeNull();
  });

  it("sells nothing to a firm already on the top plan", () => {
    expect(priceCentsFor("season", "firm")).toBeNull();
    expect(priceCentsFor("firm", "firm")).toBeNull();
  });

  it("formats prices", () => {
    expect(formatUsd(14_900)).toBe("$149");
    expect(formatUsd(29_900)).toBe("$299");
    expect(formatUsd(14_950)).toBe("$149.50");
    expect(formatUsd(123_400)).toBe("$1,234");
  });
});

describe("seasonTaxYear", () => {
  it("is this year's payments from April on", () => {
    expect(seasonTaxYear(new Date("2026-11-22T12:00:00Z"))).toBe(2026);
    expect(seasonTaxYear(new Date("2026-04-01T00:00:00Z"))).toBe(2026);
  });

  it("is last year's payments during filing season", () => {
    expect(seasonTaxYear(new Date("2027-01-15T12:00:00Z"))).toBe(2026);
    expect(seasonTaxYear(new Date("2027-03-31T23:59:59Z"))).toBe(2026);
  });
});

describe("checkoutSessionParams", () => {
  const params = checkoutSessionParams({
    orgId: ORG,
    plan: "season",
    taxYear: 2026,
    amountCents: 14_900,
    brandName: "FormStickler",
    customerEmail: "owner@example.com",
    successUrl: "https://app.example.com/dashboard/plan?session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://app.example.com/dashboard/plan",
  });

  it("asks for a one-time payment at the server's price", () => {
    expect(params.get("mode")).toBe("payment");
    expect(params.get("line_items[0][quantity]")).toBe("1");
    expect(params.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(params.get("line_items[0][price_data][unit_amount]")).toBe("14900");
    expect(params.get("line_items[0][price_data][product_data][name]")).toBe(
      "FormStickler Season plan, 2026 1099 season",
    );
  });

  it("carries what the webhook needs to find the firm", () => {
    expect(params.get("client_reference_id")).toBe(ORG);
    expect(params.get("metadata[product]")).toBe(CHECKOUT_PRODUCT);
    expect(params.get("metadata[org_id]")).toBe(ORG);
    expect(params.get("metadata[plan]")).toBe("season");
    expect(params.get("metadata[tax_year]")).toBe("2026");
    expect(params.get("customer_email")).toBe("owner@example.com");
  });

  it("keeps Stripe's session id placeholder intact when encoded", () => {
    expect(params.get("success_url")).toContain("{CHECKOUT_SESSION_ID}");
    const decoded = new URLSearchParams(params.toString());
    expect(decoded.get("success_url")).toBe(
      "https://app.example.com/dashboard/plan?session_id={CHECKOUT_SESSION_ID}",
    );
  });

  it("leaves the email out when there is none", () => {
    const without = checkoutSessionParams({
      orgId: ORG,
      plan: "firm",
      taxYear: 2026,
      amountCents: 29_900,
      brandName: "FormStickler",
      customerEmail: null,
      successUrl: "https://app.example.com/a",
      cancelUrl: "https://app.example.com/b",
    });
    expect(without.has("customer_email")).toBe(false);
  });
});

describe("verifyStripeSignature", () => {
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const now = 1_800_000_000;
  const sign = (payload: string, t: number, key = secret) =>
    createHmac("sha256", key).update(`${t}.${payload}`).digest("hex");

  it("accepts a correctly signed body", () => {
    expect(verifyStripeSignature(body, `t=${now},v1=${sign(body, now)}`, secret, now)).toBe(true);
  });

  it("accepts when any v1 signature matches, and ignores other schemes", () => {
    const header = `t=${now},v1=${"0".repeat(64)},v1=${sign(body, now)},v0=${"1".repeat(64)}`;
    expect(verifyStripeSignature(body, header, secret, now)).toBe(true);
  });

  it("refuses a changed body", () => {
    const header = `t=${now},v1=${sign(body, now)}`;
    expect(verifyStripeSignature(body.replace("evt_1", "evt_2"), header, secret, now)).toBe(false);
  });

  it("refuses a signature made with another secret", () => {
    const header = `t=${now},v1=${sign(body, now, "whsec_other")}`;
    expect(verifyStripeSignature(body, header, secret, now)).toBe(false);
  });

  it("refuses a signature only under v0", () => {
    expect(verifyStripeSignature(body, `t=${now},v0=${sign(body, now)}`, secret, now)).toBe(false);
  });

  it("refuses a timestamp that was swapped after signing", () => {
    const header = `t=${now},v1=${sign(body, now - 10)}`;
    expect(verifyStripeSignature(body, header, secret, now)).toBe(false);
  });

  it("refuses old and far-future timestamps", () => {
    const old = now - 301;
    expect(verifyStripeSignature(body, `t=${old},v1=${sign(body, old)}`, secret, now)).toBe(false);
    const future = now + 301;
    expect(verifyStripeSignature(body, `t=${future},v1=${sign(body, future)}`, secret, now)).toBe(false);
    const edge = now - 300;
    expect(verifyStripeSignature(body, `t=${edge},v1=${sign(body, edge)}`, secret, now)).toBe(true);
  });

  it("refuses missing or malformed headers", () => {
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, "", secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `v1=${sign(body, now)}`, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now}`, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=abc,v1=${sign(body, now)}`, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now},v1=short`, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now},v1=${"z".repeat(64)}`, secret, now)).toBe(false);
  });

  it("refuses everything when the secret is empty", () => {
    const header = `t=${now},v1=${sign(body, now, "")}`;
    expect(verifyStripeSignature(body, header, "", now)).toBe(false);
  });
});

describe("readPaidSession", () => {
  const paid = {
    id: "cs_test_123",
    mode: "payment",
    payment_status: "paid",
    currency: "usd",
    amount_total: 14_900,
    customer: null,
    metadata: { product: CHECKOUT_PRODUCT, org_id: ORG, plan: "season", tax_year: "2026" },
  };

  it("reads a paid session", () => {
    expect(readPaidSession(paid)).toEqual({
      sessionId: "cs_test_123",
      orgId: ORG,
      plan: "season",
      taxYear: 2026,
      amountCents: 14_900,
      customerId: null,
    });
  });

  it("keeps the Stripe customer when there is one", () => {
    expect(readPaidSession({ ...paid, customer: "cus_123" })?.customerId).toBe("cus_123");
  });

  it("accepts both prices for the Firm plan", () => {
    const firm = { ...paid, metadata: { ...paid.metadata, plan: "firm" } };
    expect(readPaidSession({ ...firm, amount_total: 29_900 })?.plan).toBe("firm");
    expect(readPaidSession({ ...firm, amount_total: 15_000 })?.plan).toBe("firm");
  });

  it("refuses a session that is not paid yet", () => {
    expect(readPaidSession({ ...paid, payment_status: "unpaid" })).toBeNull();
    expect(readPaidSession({ ...paid, payment_status: "no_payment_required" })).toBeNull();
  });

  it("refuses sessions for anything else sold on the same Stripe account", () => {
    expect(readPaidSession({ ...paid, metadata: {} })).toBeNull();
    expect(readPaidSession({ ...paid, metadata: null })).toBeNull();
    expect(readPaidSession({ ...paid, metadata: { ...paid.metadata, product: "other" } })).toBeNull();
    expect(readPaidSession({ ...paid, mode: "subscription" })).toBeNull();
  });

  it("refuses a price we do not charge for that plan", () => {
    expect(readPaidSession({ ...paid, amount_total: 100 })).toBeNull();
    expect(readPaidSession({ ...paid, amount_total: 15_000 })).toBeNull();
    expect(readPaidSession({ ...paid, amount_total: "14900" })).toBeNull();
    const firm = { ...paid, metadata: { ...paid.metadata, plan: "firm" } };
    expect(readPaidSession({ ...firm, amount_total: 14_900 })).toBeNull();
  });

  it("refuses another currency", () => {
    expect(readPaidSession({ ...paid, currency: "eur" })).toBeNull();
  });

  it("refuses bad firm ids, plans and years", () => {
    expect(readPaidSession({ ...paid, metadata: { ...paid.metadata, org_id: "nope" } })).toBeNull();
    expect(readPaidSession({ ...paid, metadata: { ...paid.metadata, plan: "free" } })).toBeNull();
    expect(readPaidSession({ ...paid, metadata: { ...paid.metadata, tax_year: "soon" } })).toBeNull();
    expect(readPaidSession({ ...paid, metadata: { ...paid.metadata, tax_year: "1999" } })).toBeNull();
  });

  it("refuses things that are not sessions", () => {
    expect(readPaidSession(null)).toBeNull();
    expect(readPaidSession("cs_test_123")).toBeNull();
    expect(readPaidSession({ ...paid, id: "" })).toBeNull();
  });

  it("reads the session out of the two paid events only", () => {
    expect(paidSessionFromEvent({ type: "checkout.session.completed", data: { object: paid } })?.sessionId).toBe(
      "cs_test_123",
    );
    expect(
      paidSessionFromEvent({ type: "checkout.session.async_payment_succeeded", data: { object: paid } })?.plan,
    ).toBe("season");
    expect(paidSessionFromEvent({ type: "checkout.session.expired", data: { object: paid } })).toBeNull();
    expect(paidSessionFromEvent({ type: "checkout.session.completed" })).toBeNull();
    expect(paidSessionFromEvent(null)).toBeNull();
  });
});
