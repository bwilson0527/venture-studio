import { describe, expect, it } from "vitest";
import { importPayeesFromCsv, parseMoneyToCents } from "./payee-import";

describe("parseMoneyToCents", () => {
  it.each([
    ["$1,234.50", 123450],
    ["1234.5", 123450],
    ["2000", 200000],
    ["0.07", 7],
    ["(250.00)", -25000],
    ["-250", -25000],
    [" $ 12 ", 1200],
  ])("parses %j", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "1.234", "1,2.3.4", "12 USD"])("rejects %j", (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });

  it("does not lose a cent to floating point", () => {
    expect(parseMoneyToCents("1999.99")).toBe(199999);
    expect(parseMoneyToCents("0.29")).toBe(29);
  });
});

describe("importPayeesFromCsv", () => {
  it("imports a bookkeeping-style vendor export and drops the totals row", () => {
    const result = importPayeesFromCsv(
      'Vendor,Email,Total\n"Lopez Electric, LLC",Office@Lopez.example,"$4,200.00"\nSam Rivera,,850\nTOTAL,,"5,050.00"\n',
    );
    expect(result.issues).toEqual([]);
    expect(result.payees).toEqual([
      { name: "Lopez Electric, LLC", email: "office@lopez.example", amountPaidCents: 420000 },
      { name: "Sam Rivera", email: null, amountPaidCents: 85000 },
    ]);
  });

  it("works with only a name column", () => {
    const result = importPayeesFromCsv("Contractor Name\nAda Lovelace\n");
    expect(result.payees).toEqual([{ name: "Ada Lovelace", email: null, amountPaidCents: null }]);
  });

  it("reports a missing name column and an empty file", () => {
    expect(importPayeesFromCsv("email\nx@example.com\n").issues[0]?.message).toMatch(
      /No vendor name column/,
    );
    expect(importPayeesFromCsv("").issues[0]?.message).toMatch(/empty/);
  });

  it("keeps a payee with a bad email or amount and says so", () => {
    const result = importPayeesFromCsv("name,email,amount\nAda,not-an-email,lots\n");
    expect(result.payees).toEqual([{ name: "Ada", email: null, amountPaidCents: null }]);
    expect(result.issues.map((i) => i.line)).toEqual([2, 2]);
  });

  it("skips duplicates by email, or by name when there is no email", () => {
    const result = importPayeesFromCsv(
      "name,email\nAda,a@example.com\nAda L.,a@example.com\nBob\nbob\n",
    );
    expect(result.payees.map((p) => p.name)).toEqual(["Ada", "Bob"]);
    expect(result.issues.map((i) => i.line)).toEqual([3, 5]);
  });

  it("uses the first of two columns that map to the same field", () => {
    const result = importPayeesFromCsv("Vendor,Company\nAda,Analytical Engines\n");
    expect(result.payees[0]?.name).toBe("Ada");
  });
});
