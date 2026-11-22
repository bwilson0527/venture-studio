import { describe, expect, it } from "vitest";
import { checkEin, checkSsn, checkTin, maskTin } from "./tin";

describe("checkSsn", () => {
  it("accepts a well-formed SSN in common formats", () => {
    for (const input of ["212-45-6789", "212456789", " 212 45 6789 "]) {
      expect(checkSsn(input)).toEqual({
        ok: true,
        digits: "212456789",
        formatted: "212-45-6789",
        last4: "6789",
      });
    }
  });

  it.each([
    ["12345678", "9 digits"],
    ["2124567890", "9 digits"],
    ["212-45-678X", "digits only"],
    ["000-45-6789", "not a valid"],
    ["666-45-6789", "not a valid"],
    ["212-00-6789", "not a valid"],
    ["212-45-0000", "not a valid"],
    ["111-11-1111", "placeholder"],
    ["123-45-6789", "placeholder"],
    ["078-05-1120", "placeholder"],
  ])("rejects %s", (input, reason) => {
    const result = checkSsn(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.toLowerCase()).toContain(reason);
  });

  it("accepts an ITIN, which shares the SSN box on a W-9", () => {
    expect(checkSsn("912-70-1234").ok).toBe(true);
    expect(checkSsn("999-88-1234").ok).toBe(true);
  });

  it("rejects 9xx numbers outside the ITIN ranges", () => {
    expect(checkSsn("912-45-1234").ok).toBe(false);
    expect(checkSsn("912-93-1234").ok).toBe(false);
    expect(checkSsn("912-89-1234").ok).toBe(false);
  });
});

describe("checkEin", () => {
  it("accepts a well-formed EIN", () => {
    expect(checkEin("46-1234567")).toEqual({
      ok: true,
      digits: "461234567",
      formatted: "46-1234567",
      last4: "4567",
    });
  });

  it("warns, but does not reject, on an unusual prefix", () => {
    const result = checkEin("07-1234567");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warning).toMatch(/rarely start with 07/);
  });

  it.each(["00-1234567", "12-345678", "12-34567890", "ab-1234567", "22-2222222"])(
    "rejects %s",
    (input) => {
      expect(checkEin(input).ok).toBe(false);
    },
  );
});

describe("checkTin and maskTin", () => {
  it("dispatches by type", () => {
    expect(checkTin("ein", "46-1234567").ok).toBe(true);
    expect(checkTin("ssn", "46-1234567").ok).toBe(true); // 9 digits, valid as an SSN too
    expect(checkTin("ssn", "000-12-3456").ok).toBe(false);
  });

  it("masks all but the last four digits", () => {
    expect(maskTin("ssn", "6789")).toBe("***-**-6789");
    expect(maskTin("ein", "4567")).toBe("**-***4567");
  });
});
