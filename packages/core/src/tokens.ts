import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

/**
 * Derive a client's portal token from a server secret, so the link can be
 * shown again later without ever storing it. Bumping `version` rotates the
 * link and invalidates the old one.
 */
export function derivePortalToken(
  secret: string,
  clientId: string,
  version: number,
): { token: string; hash: string } {
  if (secret.length < 32) {
    throw new Error("PORTAL_TOKEN_SECRET must be at least 32 characters");
  }
  const token = createHmac("sha256", secret)
    .update(`${clientId}:${version}`)
    .digest("base64url");
  return { token, hash: hashPortalToken(token) };
}
