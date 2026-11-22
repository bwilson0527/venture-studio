import "server-only";

import { decryptField } from "@studio/core/secrets";
import { buildW9ExportCsv, w9ExportFileName, type ExportVendor } from "@studio/core/w9/export";

import { serverEnv } from "./env";
import { listBusinesses } from "./firm-store";
import { tinContext } from "./portal-store";
import type { Session } from "./session";
import { adminClient } from "./supabase-admin";

/**
 * Build the 1099 filing export for one client business.
 *
 * Full taxpayer IDs exist only encrypted, and only the server can read
 * them. So this first confirms, as the signed-in user, that the client
 * business is theirs. Then the server fetches the rows (the database
 * checks the membership again and records the export) and decrypts each
 * ID in memory. Nothing decrypted is logged or stored.
 *
 * Returns null when the user cannot see the client business.
 */
export async function buildExport(
  session: Session,
  businessId: string,
  includeTins: boolean,
): Promise<{ fileName: string; csv: string } | null> {
  const business = (await listBusinesses(session.db)).find((b) => b.id === businessId);
  if (!business) return null;

  const { data, error } = await adminClient().rpc("export_w9s", {
    p_client_business_id: businessId,
    p_member_id: session.userId,
    p_include_tins: includeTins,
  });
  if (error) throw new Error(`export_w9s failed: ${error.code} ${error.message}`);

  const key = includeTins ? serverEnv.tinEncryptionKey : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendors: ExportVendor[] = (data as Record<string, any>[]).map((row) => ({
    name: row.payee_name,
    email: row.email,
    amountPaidCents: row.amount_paid_cents,
    legalOrMedical: row.legal_or_medical,
    w9: row.signed_at
      ? {
          legalName: row.legal_name,
          businessName: row.business_name,
          classification: row.tax_classification,
          otherClassification: row.other_classification,
          exemptPayeeCode: row.exempt_payee_code,
          fatcaCode: row.fatca_exemption_code,
          addressLine1: row.address_line1,
          addressLine2: row.address_line2,
          city: row.city,
          state: row.state,
          postalCode: row.postal_code,
          tinType: row.tin_type,
          tinLast4: row.tin_last4,
          tin:
            key && row.tin_ciphertext
              ? decryptField(key, row.tin_ciphertext, tinContext(row.payee_id))
              : null,
          backupWithholding: row.backup_withholding,
          signedName: row.signed_name,
          signedAt: row.signed_at,
        }
      : null,
  }));

  return {
    fileName: w9ExportFileName(business.name, business.taxYear, includeTins),
    csv: buildW9ExportCsv(vendors, business.taxYear),
  };
}
