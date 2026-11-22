import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { readEmailEvent, verifySvixSignature } from "./email-events";

describe("verifySvixSignature", () => {
  // The example published in Svix's guide to verifying by hand.
  const secret = "whsec_plJ3nmyCDGBKInavdOK15jsl";
  const body = '{"event_type":"ping","data":{"success":true}}';
  const id = "msg_loFOjxBNrRLzqYUf";
  const timestamp = "1731705121";
  const signature = "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=";
  const now = 1731705121;

  it("accepts the published example", () => {
    expect(verifySvixSignature(body, { id, timestamp, signature }, secret, now)).toBe(true);
  });

  it("accepts when any listed signature matches", () => {
    const listed = `v1,${Buffer.alloc(32).toString("base64")} ${signature} v2,ignored`;
    expect(verifySvixSignature(body, { id, timestamp, signature: listed }, secret, now)).toBe(true);
  });

  it("refuses a changed body, id or timestamp", () => {
    expect(verifySvixSignature(body.replace("true", "false"), { id, timestamp, signature }, secret, now)).toBe(false);
    expect(verifySvixSignature(body, { id: "msg_other", timestamp, signature }, secret, now)).toBe(false);
    expect(verifySvixSignature(body, { id, timestamp: "1731705122", signature }, secret, now)).toBe(false);
  });

  it("refuses another secret, and a secret in the wrong form", () => {
    expect(verifySvixSignature(body, { id, timestamp, signature }, "whsec_b3RoZXJzZWNyZXQ=", now)).toBe(false);
    expect(verifySvixSignature(body, { id, timestamp, signature }, "plJ3nmyCDGBKInavdOK15jsl", now)).toBe(false);
    expect(verifySvixSignature(body, { id, timestamp, signature }, "", now)).toBe(false);
    expect(verifySvixSignature(body, { id, timestamp, signature }, "whsec_", now)).toBe(false);
  });

  it("refuses an empty key even when the signature was made with one", () => {
    const forged = createHmac("sha256", Buffer.alloc(0)).update(`${id}.${timestamp}.${body}`).digest("base64");
    expect(verifySvixSignature(body, { id, timestamp, signature: `v1,${forged}` }, "whsec_", now)).toBe(false);
  });

  it("refuses old and far-future timestamps", () => {
    expect(verifySvixSignature(body, { id, timestamp, signature }, secret, now + 301)).toBe(false);
    expect(verifySvixSignature(body, { id, timestamp, signature }, secret, now - 301)).toBe(false);
    expect(verifySvixSignature(body, { id, timestamp, signature }, secret, now + 300)).toBe(true);
  });

  it("refuses missing or malformed headers", () => {
    expect(verifySvixSignature(body, { id: null, timestamp, signature }, secret, now)).toBe(false);
    expect(verifySvixSignature(body, { id, timestamp: null, signature }, secret, now)).toBe(false);
    expect(verifySvixSignature(body, { id, timestamp, signature: null }, secret, now)).toBe(false);
    expect(verifySvixSignature(body, { id, timestamp: "soon", signature }, secret, now)).toBe(false);
    expect(verifySvixSignature(body, { id, timestamp, signature: signature.slice(3) }, secret, now)).toBe(false);
    expect(verifySvixSignature(body, { id, timestamp, signature: signature.replace("v1", "v2") }, secret, now)).toBe(false);
    expect(verifySvixSignature(body, { id, timestamp, signature: "v1,short" }, secret, now)).toBe(false);
  });
});

describe("readEmailEvent", () => {
  const bounced = {
    type: "email.bounced",
    created_at: "2026-11-22T20:00:00.000Z",
    data: {
      email_id: "56761188-7520-42d8-8898-ff6fc54ce618",
      to: ["Vendor@Example.com"],
      subject: "W-9 request",
      bounce: { type: "Permanent", subType: "Suppressed", message: "The recipient is on the suppression list." },
    },
  };

  it("reads a permanent bounce", () => {
    expect(readEmailEvent(bounced)).toEqual({
      kind: "bounced",
      emailId: "56761188-7520-42d8-8898-ff6fc54ce618",
      recipient: "vendor@example.com",
      detail: "Permanent: Suppressed: The recipient is on the suppression list.",
      happenedAt: Date.parse("2026-11-22T20:00:00.000Z"),
    });
  });

  it("ignores a temporary bounce", () => {
    expect(readEmailEvent({ ...bounced, data: { ...bounced.data, bounce: { type: "Temporary" } } })).toBeNull();
  });

  it("treats a bounce with no details as permanent", () => {
    const bare = readEmailEvent({ type: "email.bounced", data: { email_id: "abc" } });
    expect(bare).toEqual({ kind: "bounced", emailId: "abc", recipient: null, detail: "bounced", happenedAt: null });
  });

  it("keeps the reason short", () => {
    const long = { ...bounced, data: { ...bounced.data, bounce: { type: "Permanent", message: "x".repeat(1000) } } };
    expect(readEmailEvent(long)?.detail.length).toBe(300);
  });

  it("reads a spam complaint", () => {
    const event = { type: "email.complained", created_at: "2026-11-22T20:00:00.000Z", data: { email_id: "abc", to: ["a@b.co"] } };
    expect(readEmailEvent(event)).toMatchObject({ kind: "complained", emailId: "abc", recipient: "a@b.co" });
  });

  it("ignores every other event and anything malformed", () => {
    expect(readEmailEvent({ type: "email.delivered", data: { email_id: "abc" } })).toBeNull();
    expect(readEmailEvent({ type: "email.opened", data: { email_id: "abc" } })).toBeNull();
    expect(readEmailEvent({ type: "email.bounced" })).toBeNull();
    expect(readEmailEvent({ type: "email.bounced", data: { email_id: "" } })).toBeNull();
    expect(readEmailEvent({ type: "email.bounced", data: { email_id: 7 } })).toBeNull();
    expect(readEmailEvent(null)).toBeNull();
    expect(readEmailEvent("email.bounced")).toBeNull();
  });
});
