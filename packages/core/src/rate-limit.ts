import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/**
 * How often the public pages may be used. Each rule counts attempts for one
 * subject (an email address or a network address) in a fixed window.
 */
export const LIMITS = {
  /** Sign-in codes sent to one address. Stops someone flooding a stranger's inbox. */
  signInSendPerEmail: { limit: 5, windowSeconds: 3600 },
  /** Sign-in codes asked for from one network address, whatever the email. */
  signInSendPerIp: { limit: 20, windowSeconds: 3600 },
  /** Code guesses for one address. A six-digit code cannot be guessed at this rate. */
  signInVerifyPerEmail: { limit: 10, windowSeconds: 900 },
  signInVerifyPerIp: { limit: 40, windowSeconds: 900 },
  /** Early-access sign-ups from one network address. */
  leadPerIp: { limit: 5, windowSeconds: 3600 },
} as const;

export type LimitName = keyof typeof LIMITS;

/**
 * The key a limit is counted under. The subject is hashed with a server
 * secret, so the database never holds an email or network address for this.
 */
export function rateLimitKey(secret: string, name: LimitName, subject: string): string {
  if (secret.length < 32) throw new Error("The rate limit secret must be at least 32 characters");
  const digest = createHmac("sha256", secret)
    .update(`rate-limit:${name}:${subject.trim().toLowerCase()}`)
    .digest("base64url");
  return `${name}:${digest.slice(0, 32)}`;
}

/**
 * The visitor's network address from the request headers, or "unknown".
 * `x-nf-client-connection-ip` is set by the host and cannot be forged by
 * the visitor; the first `x-forwarded-for` entry is the fallback elsewhere.
 */
export function clientAddress(get: (header: string) => string | null): string {
  const candidates = [get("x-nf-client-connection-ip"), get("x-forwarded-for")?.split(",")[0]];
  for (const candidate of candidates) {
    const value = candidate?.trim() ?? "";
    if (isIP(value)) return value;
  }
  return "unknown";
}
