import { describe, expect, it } from "vitest";
import { neutralizeFormula, parseCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"Smith, Jo","say ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["Smith, Jo", 'say "hi"'],
    ]);
  });

  it("strips a byte order mark and blank lines", () => {
    expect(parseCsv("﻿name\n\nAda\n")).toEqual([["name"], ["Ada"]]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('"line one\nline two",x')).toEqual([["line one\nline two", "x"]]);
  });
});

describe("toCsv", () => {
  it("quotes cells that need it and round-trips through parseCsv", () => {
    const csv = toCsv(["name", "note"], [["Smith, Jo", 'say "hi"'], ["Ada", null]]);
    expect(csv).toBe('name,note\r\n"Smith, Jo","say ""hi"""\r\nAda,\r\n');
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ["Smith, Jo", 'say "hi"'],
      ["Ada", ""],
    ]);
  });

  it("writes numbers without quoting or prefixing", () => {
    expect(toCsv(["amount"], [[-12.5]])).toBe("amount\r\n-12.5\r\n");
  });

  it("neutralizes cells a spreadsheet would run as a formula", () => {
    expect(neutralizeFormula('=HYPERLINK("http://x","y")')).toBe(
      `'=HYPERLINK("http://x","y")`,
    );
    expect(neutralizeFormula("+1 555 201 3344")).toBe("'+1 555 201 3344");
    expect(neutralizeFormula("@cmd")).toBe("'@cmd");
    expect(neutralizeFormula("Acme - West")).toBe("Acme - West");
    expect(toCsv(["name"], [["=1+1"]])).toBe("name\r\n'=1+1\r\n");
  });
});
