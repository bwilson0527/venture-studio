import { describe, expect, it } from "vitest";

import { clientAddress, LIMITS, rateLimitKey } from "./rate-limit";

const SECRET = "a-secret-that-is-at-least-32-characters-long";

describe("rateLimitKey", () => {
  it("is stable for the same subject, whatever its case or spacing", () => {
    const key = rateLimitKey(SECRET, "signInSendPerEmail", "owner@example.com");
    expect(rateLimitKey(SECRET, "signInSendPerEmail", " Owner@Example.com ")).toBe(key);
    expect(key).toMatch(/^signInSendPerEmail:[A-Za-z0-9_-]{32}$/);
  });

  it("differs by subject, by limit and by secret", () => {
    const key = rateLimitKey(SECRET, "signInSendPerEmail", "owner@example.com");
    expect(rateLimitKey(SECRET, "signInSendPerEmail", "other@example.com")).not.toBe(key);
    expect(rateLimitKey(SECRET, "signInVerifyPerEmail", "owner@example.com").split(":")[1]).not.toBe(
      key.split(":")[1],
    );
    expect(rateLimitKey(`${SECRET}!`, "signInSendPerEmail", "owner@example.com")).not.toBe(key);
  });

  it("does not contain the subject", () => {
    expect(rateLimitKey(SECRET, "leadPerIp", "203.0.113.9")).not.toContain("203.0.113.9");
  });

  it("refuses a short secret", () => {
    expect(() => rateLimitKey("short", "leadPerIp", "203.0.113.9")).toThrow();
  });
});

describe("clientAddress", () => {
  const from = (headers: Record<string, string>) => (name: string) => headers[name] ?? null;

  it("prefers the address the host reports", () => {
    expect(
      clientAddress(from({ "x-nf-client-connection-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" })),
    ).toBe("203.0.113.9");
  });

  it("falls back to the first forwarded address", () => {
    expect(clientAddress(from({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientAddress(from({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("ignores values that are not addresses", () => {
    expect(clientAddress(from({ "x-forwarded-for": "not-an-address" }))).toBe("unknown");
    expect(clientAddress(from({ "x-nf-client-connection-ip": "x", "x-forwarded-for": "198.51.100.1" }))).toBe(
      "198.51.100.1",
    );
    expect(clientAddress(from({}))).toBe("unknown");
  });
});

describe("LIMITS", () => {
  it("keeps code guessing far below what a six-digit code needs", () => {
    const perDay = (LIMITS.signInVerifyPerEmail.limit * 86_400) / LIMITS.signInVerifyPerEmail.windowSeconds;
    expect(perDay).toBeLessThan(1_000_000 / 100);
  });
});
