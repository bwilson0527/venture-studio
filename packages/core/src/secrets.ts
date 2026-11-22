import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Field-level encryption for values that must not sit in the database in
 * the clear, such as taxpayer ID numbers. AES-256-GCM with a random nonce
 * per value. `context` (for example the row id) is authenticated but not
 * stored, so a ciphertext copied onto another row will not decrypt.
 *
 * Format: v1.<nonce>.<ciphertext>.<tag>, each part base64url.
 */

function loadKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes, base64-encoded");
  }
  return key;
}

export function generateKey(): string {
  return randomBytes(32).toString("base64");
}

export function encryptField(keyBase64: string, plaintext: string, context: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", loadKey(keyBase64), nonce);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", nonce, ciphertext, cipher.getAuthTag()]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptField(keyBase64: string, sealed: string, context: string): string {
  const [version, nonce, ciphertext, tag] = sealed.split(".");
  if (version !== "v1" || !nonce || ciphertext === undefined || !tag) {
    throw new Error("Unrecognized encrypted value");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    loadKey(keyBase64),
    Buffer.from(nonce, "base64url"),
  );
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
