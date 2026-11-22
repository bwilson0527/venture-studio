/**
 * Early-access sign-ups from the landing page: the checks applied before a
 * lead is stored.
 */

export const CLIENT_COUNT_CHOICES = [
  { value: "1-10", label: "1 to 10" },
  { value: "11-25", label: "11 to 25" },
  { value: "26-100", label: "26 to 100" },
  { value: "100+", label: "More than 100" },
] as const;

export type ClientCount = (typeof CLIENT_COUNT_CHOICES)[number]["value"];

export type LeadInput = {
  email?: string;
  firmName?: string;
  clientCount?: string;
  /** Hidden from people. Anything typed here came from a bot. */
  website?: string;
};

export type Lead = {
  email: string;
  firmName: string | null;
  clientCount: ClientCount | null;
};

export type LeadResult =
  | { ok: true; value: Lead }
  /** A bot filled the hidden field. Pretend it worked; store nothing. */
  | { ok: true; value: null }
  | { ok: false; errors: Partial<Record<"email" | "firmName", string>> };

// Deliberately loose: one @, no spaces, a dot in the domain. Real proof that
// an address works is a message arriving, not a pattern.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateLead(input: LeadInput): LeadResult {
  if ((input.website ?? "").trim() !== "") return { ok: true, value: null };

  const errors: Partial<Record<"email" | "firmName", string>> = {};

  const email = (input.email ?? "").trim().toLowerCase();
  if (email === "") errors.email = "Enter your work email.";
  else if (email.length > 254 || !EMAIL.test(email)) {
    errors.email = "That does not look like an email address.";
  }

  const firmName = (input.firmName ?? "").replace(/\s+/g, " ").trim();
  if (firmName.length > 200) errors.firmName = "Keep the firm name under 200 characters.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const clientCount = CLIENT_COUNT_CHOICES.find((choice) => choice.value === input.clientCount);
  return {
    ok: true,
    value: { email, firmName: firmName || null, clientCount: clientCount?.value ?? null },
  };
}
