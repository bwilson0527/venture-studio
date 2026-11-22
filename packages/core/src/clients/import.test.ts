import { describe, expect, it } from "vitest";
import {
  importClientsFromCsv,
  normalizePhone,
  normalizeReturnType,
  parseCsv,
} from "./import";

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes and CRLF", () => {
    const rows = parseCsv('a,b\r\n"Smith, Jo","say ""hi"""\r\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["Smith, Jo", 'say "hi"'],
    ]);
  });

  it("strips a byte order mark and blank lines", () => {
    expect(parseCsv("﻿name\n\nAda\n")).toEqual([["name"], ["Ada"]]);
  });
});

describe("normalizeReturnType", () => {
  it.each([
    ["", "1040_w2"],
    ["1040", "1040_w2"],
    ["Schedule C", "1040_sched_c"],
    ["Self-employed", "1040_sched_c"],
    ["Rental", "1040_rental"],
    ["1065", "1065"],
    ["Partnership", "1065"],
    ["1120-S", "1120s"],
    ["S-Corp", "1120s"],
  ])("maps %j to %s", (input, expected) => {
    expect(normalizeReturnType(input)).toBe(expected);
  });
});

describe("normalizePhone", () => {
  it("accepts common US formats", () => {
    expect(normalizePhone("(555) 201-3344")).toBe("+15552013344");
    expect(normalizePhone("1-555-201-3344")).toBe("+15552013344");
  });

  it("rejects anything else", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe("importClientsFromCsv", () => {
  it("imports rows with loosely named headers", () => {
    const result = importClientsFromCsv(
      "Client Name,E-mail,Mobile,Return\nAda Lovelace,ADA@Example.com,555-201-3344,Sched C\n",
    );
    expect(result.issues).toEqual([]);
    expect(result.clients).toEqual([
      {
        name: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+15552013344",
        returnType: "1040_sched_c",
      },
    ]);
  });

  it("joins first and last name columns", () => {
    const result = importClientsFromCsv("First Name,Last Name\nGrace,Hopper\n");
    expect(result.clients[0]?.name).toBe("Grace Hopper");
  });

  it("reports a missing name column", () => {
    const result = importClientsFromCsv("email\nx@example.com\n");
    expect(result.clients).toEqual([]);
    expect(result.issues[0]?.message).toMatch(/No name column/);
  });

  it("keeps a client with a bad email but drops the email", () => {
    const result = importClientsFromCsv("name,email\nAda,not-an-email\n");
    expect(result.clients[0]).toMatchObject({ name: "Ada", email: null });
    expect(result.issues[0]?.line).toBe(2);
  });

  it("skips duplicate emails and nameless rows", () => {
    const result = importClientsFromCsv(
      "name,email\nAda,a@example.com\nAda Again,a@example.com\n,b@example.com\n",
    );
    expect(result.clients).toHaveLength(1);
    expect(result.issues.map((i) => i.line)).toEqual([3, 4]);
  });

  it("reports an empty file", () => {
    expect(importClientsFromCsv("").issues[0]?.message).toMatch(/empty/);
  });
});
