"use server";

import { isIP } from "node:net";

import { headers } from "next/headers";

import { validateW9Form, type W9FormField, type W9FormInput } from "@studio/core/w9/form";
import type { TinType } from "@studio/core/w9/tin";

import { findPayeeByToken, recordW9 } from "@/lib/portal-store";

/** What the form gets back. The taxpayer ID itself is never sent back. */
export type W9FormState =
  | { status: "idle" }
  | {
      status: "invalid";
      errors: Partial<Record<W9FormField, string>>;
      values: Omit<W9FormInput, "tin">;
    }
  | { status: "failed"; message: string; values: Omit<W9FormInput, "tin"> }
  | { status: "done"; tinType: TinType; tinLast4: string; signedName: string; signedAt: string };

const FIELDS: W9FormField[] = [
  "legalName",
  "businessName",
  "classification",
  "llcClassification",
  "otherClassification",
  "hasForeignPartners",
  "exemptPayeeCode",
  "fatcaCode",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "tinType",
  "tin",
  "backupWithholding",
  "certify",
  "signedName",
];

const LINK_GONE =
  "This link is no longer valid. Please ask the firm that sent it for a new one.";
const TOO_MANY =
  "This form has been submitted too many times. Please contact the firm that sent the link.";
const TRY_AGAIN = "We could not save your form. Nothing was stored. Please try again.";

/** The visitor's address as the hosting platform reports it, if it is one. */
function clientIp(forwardedFor: string | null): string | null {
  const first = forwardedFor?.split(",")[0]?.trim() ?? "";
  return isIP(first) ? first : null;
}

export async function submitW9(
  token: string,
  _previous: W9FormState,
  formData: FormData,
): Promise<W9FormState> {
  const input: W9FormInput = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string") input[field] = value;
  }
  const values: Omit<W9FormInput, "tin"> = { ...input };
  delete (values as W9FormInput).tin;

  const result = validateW9Form(input);
  if (!result.ok) return { status: "invalid", errors: result.errors, values };

  try {
    // The link is the payee's only credential, so it is checked again here
    // rather than trusted because the page rendered.
    const payee = await findPayeeByToken(token);
    if (!payee) return { status: "failed", message: LINK_GONE, values };

    const requestHeaders = await headers();
    const outcome = await recordW9(token, payee.payeeId, result.value, {
      ip: clientIp(requestHeaders.get("x-forwarded-for")),
      userAgent: requestHeaders.get("user-agent"),
    });
    if (!outcome.ok) {
      return {
        status: "failed",
        message: outcome.reason === "invalid_link" ? LINK_GONE : TOO_MANY,
        values,
      };
    }
  } catch (error) {
    // Log the cause without the form: it holds a taxpayer ID.
    console.error("W-9 submission failed:", error instanceof Error ? error.message : "unknown error");
    return { status: "failed", message: TRY_AGAIN, values };
  }

  return {
    status: "done",
    tinType: result.value.tinType,
    tinLast4: result.value.tinLast4,
    signedName: result.value.signedName,
    signedAt: new Date().toISOString(),
  };
}
