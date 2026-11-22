import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Delivery news from the email provider (Resend, whose webhooks are sent
 * and signed by Svix): an address bounced, or a recipient marked the email
 * as spam. Nothing here talks to the network.
 */

export type SvixHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

/**
 * True when a webhook really came from the provider. The signed content is
 * `${id}.${timestamp}.${rawBody}`, the key is the base64 part of the secret
 * after `whsec_`, and the header lists one or more `v1,<base64 signature>`
 * entries separated by spaces. Old timestamps are refused so a captured
 * request cannot be replayed.
 */
export function verifySvixSignature(
  rawBody: string,
  headers: SvixHeaders,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;

  const encodedKey = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : "";
  const key = Buffer.from(encodedKey, "base64");
  if (key.length === 0) return false;

  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(" ").some((entry) => {
    const comma = entry.indexOf(",");
    if (comma === -1 || entry.slice(0, comma) !== "v1") return false;
    const given = Buffer.from(entry.slice(comma + 1), "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type EmailEvent = {
  kind: "bounced" | "complained";
  /** The provider's id for the email, as returned when it was sent. */
  emailId: string;
  recipient: string | null;
  /** A short reason to keep with the record. Never shown to the vendor. */
  detail: string;
  /** When the provider says it happened, in milliseconds, if it says. */
  happenedAt: number | null;
};

/**
 * Read a webhook event. Returns it only when it is a permanent bounce or a
 * spam complaint for one email; everything else (delivered, opened, a
 * temporary bounce) returns null and needs no action.
 */
export function readEmailEvent(event: unknown): EmailEvent | null {
  if (typeof event !== "object" || event === null) return null;
  const e = event as { type?: unknown; created_at?: unknown; data?: unknown };
  if (e.type !== "email.bounced" && e.type !== "email.complained") return null;
  if (typeof e.data !== "object" || e.data === null) return null;
  const data = e.data as Record<string, unknown>;
  if (typeof data.email_id !== "string" || data.email_id === "") return null;

  const to = Array.isArray(data.to) ? data.to[0] : data.to;
  const recipient = typeof to === "string" && to.includes("@") ? to.trim().toLowerCase() : null;
  const parsed = typeof e.created_at === "string" ? Date.parse(e.created_at) : NaN;
  const happenedAt = Number.isNaN(parsed) ? null : parsed;

  if (e.type === "email.complained") {
    return { kind: "complained", emailId: data.email_id, recipient, detail: "marked as spam", happenedAt };
  }

  const bounce = (typeof data.bounce === "object" && data.bounce !== null ? data.bounce : {}) as Record<
    string,
    unknown
  >;
  // A temporary bounce may still be delivered; the provider keeps trying.
  if (bounce.type === "Temporary") return null;
  const parts = [bounce.type, bounce.subType, bounce.message].filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );
  return {
    kind: "bounced",
    emailId: data.email_id,
    recipient,
    detail: parts.join(": ").slice(0, 300) || "bounced",
    happenedAt,
  };
}
