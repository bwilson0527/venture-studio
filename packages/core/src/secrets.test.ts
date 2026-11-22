import { describe, expect, it } from "vitest";
import { decryptField, encryptField, generateKey } from "./secrets";

const key = generateKey();

describe("field encryption", () => {
  it("round-trips a value", () => {
    const sealed = encryptField(key, "212456789", "payee-1");
    expect(sealed).not.toContain("212456789");
    expect(decryptField(key, sealed, "payee-1")).toBe("212456789");
  });

  it("produces a different ciphertext each time", () => {
    expect(encryptField(key, "x", "c")).not.toBe(encryptField(key, "x", "c"));
  });

  it("refuses to decrypt under a different context", () => {
    const sealed = encryptField(key, "212456789", "payee-1");
    expect(() => decryptField(key, sealed, "payee-2")).toThrow();
  });

  it("refuses a different key", () => {
    const sealed = encryptField(key, "212456789", "payee-1");
    expect(() => decryptField(generateKey(), sealed, "payee-1")).toThrow();
  });

  it("refuses a tampered value", () => {
    const parts = encryptField(key, "212456789", "payee-1").split(".");
    parts[2] = Buffer.from("tampered!").toString("base64url");
    expect(() => decryptField(key, parts.join("."), "payee-1")).toThrow();
  });

  it("refuses a key of the wrong length and malformed input", () => {
    expect(() => encryptField("c2hvcnQ=", "x", "c")).toThrow(/32 bytes/);
    expect(() => decryptField(key, "not-sealed", "c")).toThrow(/Unrecognized/);
  });
});
