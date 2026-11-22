import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { encryptField } from "@studio/core/secrets";
import { hashPortalToken } from "@studio/core/tokens";
import type { W9Submission } from "@studio/core/w9/form";
import type { TinType } from "@studio/core/w9/tin";

import { serverEnv } from "./env";

/**
 * Data access for the payee portal. Payees never sign in, so these calls use
 * the secret key and are trusted to check the link token themselves: every
 * read and write goes through a database function that looks the payee up by
 * the hash of the token and touches nothing else.
 */

export type PortalPayee = {
  payeeId: string;
  payeeName: string;
  firmName: string;
  businessName: string;
  taxYear: number;
  /** The W-9 currently on file, if the payee has already sent one. */
  submitted: { at: string; tinType: TinType; tinLast4: string } | null;
};

export type RecordOutcome =
  | { ok: true }
  | { ok: false; reason: "invalid_link" | "too_many_submissions" };

/** Links carry 32 random bytes, base64url. Anything else is not worth a query. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

let client: SupabaseClient | undefined;

function admin(): SupabaseClient {
  client ??= createClient(serverEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** The context a taxpayer ID is sealed with, so it only decrypts for its own payee. */
export function tinContext(payeeId: string): string {
  return `w9-tin:${payeeId}`;
}

export async function findPayeeByToken(token: string): Promise<PortalPayee | null> {
  if (!TOKEN_SHAPE.test(token)) return null;

  const { data, error } = await admin().rpc("portal_lookup_payee", {
    p_token_hash: hashPortalToken(token),
  });
  if (error) throw new Error(`portal_lookup_payee failed: ${error.code} ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    payeeId: row.payee_id,
    payeeName: row.payee_name,
    firmName: row.firm_name,
    businessName: row.business_name,
    taxYear: row.tax_year,
    submitted: row.submitted_at
      ? { at: row.submitted_at, tinType: row.submitted_tin_type, tinLast4: row.submitted_tin_last4 }
      : null,
  };
}

export async function recordW9(
  token: string,
  payeeId: string,
  submission: W9Submission,
  signer: { ip: string | null; userAgent: string | null },
): Promise<RecordOutcome> {
  if (!TOKEN_SHAPE.test(token)) return { ok: false, reason: "invalid_link" };

  const { tin, ...rest } = submission;
  const { error } = await admin().rpc("portal_submit_w9", {
    p_token_hash: hashPortalToken(token),
    p_form: {
      legal_name: rest.legalName,
      business_name: rest.businessName,
      tax_classification: rest.taxClassification,
      other_classification: rest.otherClassification,
      exempt_payee_code: rest.exemptPayeeCode,
      fatca_exemption_code: rest.fatcaExemptionCode,
      address_line1: rest.addressLine1,
      address_line2: rest.addressLine2,
      city: rest.city,
      state: rest.state,
      postal_code: rest.postalCode,
      tin_type: rest.tinType,
      tin_last4: rest.tinLast4,
      backup_withholding: rest.backupWithholding,
      has_foreign_partners: rest.hasForeignPartners,
      signed_name: rest.signedName,
      certification_version: rest.certificationVersion,
    },
    p_tin_ciphertext: encryptField(serverEnv.tinEncryptionKey, tin, tinContext(payeeId)),
    p_signer_ip: signer.ip,
    p_signer_user_agent: signer.userAgent,
  });

  if (!error) return { ok: true };
  if (error.message === "invalid_link" || error.message === "too_many_submissions") {
    return { ok: false, reason: error.message };
  }
  throw new Error(`portal_submit_w9 failed: ${error.code} ${error.message}`);
}
