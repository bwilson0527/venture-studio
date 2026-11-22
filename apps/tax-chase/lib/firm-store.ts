import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { derivePortalToken } from "@studio/core/tokens";
import type { TaxClassification } from "@studio/core/w9/needs1099";
import type { ImportedPayee } from "@studio/core/w9/payee-import";
import type { TinType } from "@studio/core/w9/tin";

import { serverEnv } from "./env";

/**
 * Data access for a signed-in firm. Every call runs as the user through a
 * database function, so the database decides what they can see and change.
 * Pass the `db` from the session; nothing here uses the secret key.
 */

export type Firm = {
  id: string;
  name: string;
  role: "owner" | "preparer";
  plan: string;
  businessLimit: number;
  /** Null means no limit. */
  vendorsPerBusinessLimit: number | null;
  replyToEmail: string | null;
  timeZone: string;
};

export type BusinessSummary = {
  id: string;
  name: string;
  taxYear: number;
  vendors: number;
  received: number;
  waiting: number;
  notAsked: number;
  missingEmail: number;
  needsAttention: number;
};

export type Vendor = {
  id: string;
  name: string;
  email: string | null;
  amountPaidCents: number | null;
  legalOrMedical: boolean;
  status: "not_requested" | "requested" | "submitted";
  onHold: boolean;
  linkVersion: number;
  remindersStopped: boolean;
  emailFailing: boolean;
  requestSentAt: string | null;
  remindersSent: number;
  lastReminderAt: string | null;
  /** The W-9 on file. Only the last four digits of the taxpayer ID are ever read here. */
  w9: {
    legalName: string;
    businessName: string | null;
    classification: TaxClassification;
    exemptPayeeCode: string | null;
    tinType: TinType;
    tinLast4: string;
    backupWithholding: boolean;
    signedAt: string;
  } | null;
};

/** The refusals the database functions raise by name. */
const KNOWN_REASONS = [
  "already_in_a_firm",
  "invalid_firm_name",
  "invalid_reply_to_email",
  "invalid_time_zone",
  "no_firm",
  "invalid_business_name",
  "invalid_tax_year",
  "duplicate_client_business",
  "business_limit_reached",
  "payee_limit_reached",
  "unknown_client_business",
  "invalid_import",
  "not_a_member",
  "invalid_payee_name",
  "invalid_payee_email",
  "invalid_amount",
  "payee_has_w9",
] as const;

export type StoreReason = (typeof KNOWN_REASONS)[number];

/** A refusal with a known reason. Anything else is thrown as a plain Error. */
export class StoreRefusal extends Error {
  constructor(readonly reason: StoreReason) {
    super(reason);
    this.name = "StoreRefusal";
  }
}

async function call<T>(db: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    const reason = KNOWN_REASONS.find((known) => error.message === known);
    if (reason) throw new StoreRefusal(reason);
    throw new Error(`${fn} failed: ${error.code} ${error.message}`);
  }
  return data as T;
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function getFirm(db: SupabaseClient): Promise<Firm | null> {
  const rows = await call<Row[]>(db, "my_firm");
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.org_id,
    name: row.name,
    role: row.role,
    plan: row.plan,
    businessLimit: row.business_limit,
    vendorsPerBusinessLimit: row.payees_per_business_limit,
    replyToEmail: row.reply_to_email,
    timeZone: row.time_zone,
  };
}

export async function createFirm(db: SupabaseClient, name: string): Promise<void> {
  await call(db, "create_firm", { p_name: name });
}

/** False when the user is not the firm's owner. */
export async function updateFirm(
  db: SupabaseClient,
  settings: { name: string; replyToEmail: string; timeZone: string },
): Promise<boolean> {
  return call<boolean>(db, "update_firm", {
    p_name: settings.name,
    p_reply_to_email: settings.replyToEmail,
    p_time_zone: settings.timeZone,
  });
}

export async function listBusinesses(db: SupabaseClient): Promise<BusinessSummary[]> {
  const rows = await call<Row[]>(db, "firm_businesses");
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    taxYear: row.tax_year,
    vendors: row.payees,
    received: row.submitted,
    waiting: row.waiting,
    notAsked: row.not_requested,
    missingEmail: row.missing_email,
    needsAttention: row.needs_attention,
  }));
}

export async function createBusiness(
  db: SupabaseClient,
  name: string,
  taxYear: number,
): Promise<string> {
  return call<string>(db, "create_client_business", { p_name: name, p_tax_year: taxYear });
}

export async function listVendors(db: SupabaseClient, businessId: string): Promise<Vendor[]> {
  const rows = await call<Row[]>(db, "business_payees", { p_client_business_id: businessId });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    amountPaidCents: row.amount_paid_cents,
    legalOrMedical: row.legal_or_medical,
    status: row.status,
    onHold: row.paused,
    linkVersion: row.portal_token_version,
    remindersStopped: row.email_opted_out,
    emailFailing: row.email_failures >= 3,
    requestSentAt: row.request_sent_at,
    remindersSent: row.reminders_sent,
    lastReminderAt: row.last_reminder_at,
    w9: row.w9_signed_at
      ? {
          legalName: row.w9_legal_name,
          businessName: row.w9_business_name,
          classification: row.w9_tax_classification,
          exemptPayeeCode: row.w9_exempt_payee_code,
          tinType: row.w9_tin_type,
          tinLast4: row.w9_tin_last4,
          backupWithholding: row.w9_backup_withholding,
          signedAt: row.w9_signed_at,
        }
      : null,
  }));
}

export type ImportCounts = { added: number; updated: number; unchanged: number };

/**
 * Add vendors to a client business. Each new vendor gets an id here and the
 * hash of the private link derived from it, so the link can be rebuilt for
 * emails without ever being stored.
 */
export async function importVendors(
  db: SupabaseClient,
  businessId: string,
  vendors: ImportedPayee[],
): Promise<ImportCounts> {
  const secret = serverEnv.portalTokenSecret;
  const payload = vendors.map((vendor) => {
    const id = randomUUID();
    return {
      id,
      name: vendor.name,
      email: vendor.email,
      amount_paid_cents: vendor.amountPaidCents,
      portal_token_hash: derivePortalToken(secret, id, 1).hash,
    };
  });
  const rows = await call<Row[]>(db, "import_payees", {
    p_client_business_id: businessId,
    p_payees: payload,
  });
  const row = rows[0] ?? { added: 0, updated: 0, unchanged: 0 };
  return { added: row.added, updated: row.updated, unchanged: row.unchanged };
}

/** Queue W-9 requests for every vendor not asked yet. Returns how many were queued. */
export async function requestW9s(db: SupabaseClient, businessId: string): Promise<number> {
  return call<number>(db, "request_w9s", { p_client_business_id: businessId });
}

/** False when the user cannot see the vendor. */
export async function updateVendor(
  db: SupabaseClient,
  vendorId: string,
  fields: {
    name: string;
    email: string;
    amountPaidCents: number | null;
    legalOrMedical: boolean;
    onHold: boolean;
  },
): Promise<boolean> {
  return call<boolean>(db, "update_payee", {
    p_payee_id: vendorId,
    p_name: fields.name,
    p_email: fields.email,
    p_amount_paid_cents: fields.amountPaidCents,
    p_legal_or_medical: fields.legalOrMedical,
    p_paused: fields.onHold,
  });
}

/** False when the user cannot see the vendor. */
export async function deleteVendor(db: SupabaseClient, vendorId: string): Promise<boolean> {
  return call<boolean>(db, "delete_payee", { p_payee_id: vendorId });
}

/**
 * The private address where this vendor completes their W-9, for a firm
 * that wants to send it themselves. Null when the user cannot see the vendor.
 */
export async function vendorLink(
  db: SupabaseClient,
  businessId: string,
  vendorId: string,
): Promise<string | null> {
  const vendor = (await listVendors(db, businessId)).find((v) => v.id === vendorId);
  if (!vendor) return null;
  const { token } = derivePortalToken(serverEnv.portalTokenSecret, vendor.id, vendor.linkVersion);
  return `${serverEnv.appUrl}/w9/${token}`;
}
