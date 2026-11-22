import { describe, expect, it } from "vitest";
import { createPortalToken, portalTokenMatches } from "./tokens";

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
