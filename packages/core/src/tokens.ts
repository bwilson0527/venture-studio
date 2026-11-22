import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Portal links carry a random token. Only its SHA-256 hash is stored, so a
 * database leak does not expose working links.
 */
export function createPortalToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashPortalToken(token) };
}

export function hashPortalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function portalTokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashPortalToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
