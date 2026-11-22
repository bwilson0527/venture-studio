import { describe, expect, it } from "vitest";
import { validateLead } from "./leads";

describe("validateLead", () => {
  it("tidies a sign-up", () => {
    expect(
      validateLead({ email: "  Pat@LakesideBooks.com ", firmName: " Lakeside   Books ", clientCount: "11-25" }),
    ).toEqual({
      ok: true,
      value: { email: "pat@lakesidebooks.com", firmName: "Lakeside Books", clientCount: "11-25" },
    });
  });

  it("needs only an email", () => {
    expect(validateLead({ email: "pat@example.com" })).toEqual({
      ok: true,
      value: { email: "pat@example.com", firmName: null, clientCount: null },
    });
  });

  it.each(["", "pat", "pat@", "pat@example", "pat @example.com", "a@b.c", `${"x".repeat(250)}@example.com`])(
    "refuses the address %j",
    (email) => {
      const result = validateLead({ email });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.email).toBeTruthy();
    },
  );

  it("drops a client count it does not know", () => {
    const result = validateLead({ email: "pat@example.com", clientCount: "lots" });
    expect(result.ok && result.value?.clientCount).toBe(null);
  });

  it("refuses an overlong firm name", () => {
    const result = validateLead({ email: "pat@example.com", firmName: "x".repeat(201) });
    expect(result.ok).toBe(false);
  });

  it("stores nothing when the hidden field is filled", () => {
    expect(validateLead({ email: "bot@example.com", website: "http://spam.example" })).toEqual({
      ok: true,
      value: null,
    });
  });
});
