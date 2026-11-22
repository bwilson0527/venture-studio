import { describe, expect, it } from "vitest";
import {
  createPortalToken,
  derivePortalToken,
  portalTokenMatches,
} from "./tokens";

describe("portal tokens", () => {
  it("matches a token against its stored hash", () => {
    const { token, hash } = createPortalToken();
    expect(portalTokenMatches(token, hash)).toBe(true);
  });

  it("rejects a different token", () => {
    const { hash } = createPortalToken();
    expect(portalTokenMatches(createPortalToken().token, hash)).toBe(false);
  });

  it("rejects a malformed stored hash", () => {
    expect(portalTokenMatches(createPortalToken().token, "abc")).toBe(false);
  });
});

describe("derived portal tokens", () => {
  const secret = "s".repeat(32);
  const clientId = "4f0c0c56-5d0a-4a52-9d0e-1c8a0e3f9b11";

  it("is stable for the same client and version", () => {
    const a = derivePortalToken(secret, clientId, 1);
    const b = derivePortalToken(secret, clientId, 1);
    expect(a).toEqual(b);
    expect(portalTokenMatches(a.token, a.hash)).toBe(true);
  });

  it("changes when the version is bumped", () => {
    expect(derivePortalToken(secret, clientId, 2).token).not.toBe(
      derivePortalToken(secret, clientId, 1).token,
    );
  });

  it("differs per client", () => {
    expect(derivePortalToken(secret, "other", 1).token).not.toBe(
      derivePortalToken(secret, clientId, 1).token,
    );
  });

  it("refuses a short secret", () => {
    expect(() => derivePortalToken("short", clientId, 1)).toThrow();
  });
});
