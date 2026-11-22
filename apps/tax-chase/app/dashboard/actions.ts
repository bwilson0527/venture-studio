"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { importPayeesFromCsv, parseMoneyToCents, type ImportIssue } from "@studio/core/w9/payee-import";

import {
  createBusiness,
  createFirm,
  deleteVendor,
  getFirm,
  importVendors,
  requestW9s,
  StoreRefusal,
  updateFirm,
  updateVendor,
  vendorLink,
  type ImportCounts,
  type StoreReason,
} from "@/lib/firm-store";
import { requireSession, type Session } from "@/lib/session";

export type FormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string; issues: ImportIssue[] }
  | { status: "done"; counts: ImportCounts; issues: ImportIssue[] };

const TRY_AGAIN = "That did not go through. Nothing was changed. Please try again.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** A little under the server action limit set in next.config.ts. */
const MAX_UPLOAD_BYTES = 2_500_000;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Plain words for a refusal from the database. */
async function explain(reason: StoreReason, session: Session): Promise<string> {
  switch (reason) {
    case "already_in_a_firm":
      return "This account already belongs to a firm.";
    case "invalid_firm_name":
      return "Enter your firm's name, up to 200 characters.";
    case "invalid_reply_to_email":
      return "The reply-to address is not a valid email.";
    case "invalid_time_zone":
      return "Choose a time zone from the list.";
    case "invalid_business_name":
      return "Enter the client business's name, up to 200 characters.";
    case "invalid_tax_year":
      return "Choose a tax year from the list.";
    case "duplicate_client_business":
      return "You already have this client business for that tax year.";
    case "business_limit_reached": {
      const firm = await getFirm(session.db);
      return firm
        ? `Your plan covers ${plural(firm.businessLimit, "client business", "client businesses")}.`
        : "Your plan does not cover another client business.";
    }
    case "payee_limit_reached": {
      const firm = await getFirm(session.db);
      return firm?.vendorsPerBusinessLimit
        ? `Your plan covers ${firm.vendorsPerBusinessLimit} vendors per client business. Nothing was added.`
        : "Your plan does not cover that many vendors. Nothing was added.";
    }
    case "invalid_payee_name":
      return "Enter the vendor's name, up to 200 characters.";
    case "invalid_payee_email":
      return "That email address is not valid.";
    case "invalid_amount":
      return "The amount paid cannot be negative.";
    case "payee_has_w9":
      return "This vendor has signed a W-9, which has to be kept. It cannot be removed.";
    case "no_firm":
    case "not_a_member":
    case "unknown_client_business":
      return "You no longer have access to this. Reload the page.";
    case "invalid_import":
      return "The list could not be read. Nothing was added.";
  }
}

async function failure(error: unknown, session: Session, what: string): Promise<string> {
  if (error instanceof StoreRefusal) return explain(error.reason, session);
  console.error(`${what} failed:`, error instanceof Error ? error.message : "unknown error");
  return TRY_AGAIN;
}

export async function signOut(): Promise<void> {
  const session = await requireSession();
  await session.db.auth.signOut();
  redirect("/sign-in");
}

export async function startFirm(_previous: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await createFirm(session.db, field(formData, "name"));
  } catch (error) {
    if (error instanceof StoreRefusal && error.reason === "already_in_a_firm") redirect("/dashboard");
    return { status: "error", message: await failure(error, session, "Creating a firm") };
  }
  redirect("/dashboard");
}

export async function addBusiness(_previous: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  let id: string;
  try {
    id = await createBusiness(session.db, field(formData, "name"), Number(field(formData, "taxYear")));
  } catch (error) {
    return { status: "error", message: await failure(error, session, "Adding a client business") };
  }
  redirect(`/dashboard/clients/${id}`);
}

export async function saveSettings(_previous: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    const saved = await updateFirm(session.db, {
      name: field(formData, "name"),
      replyToEmail: field(formData, "replyToEmail"),
      timeZone: field(formData, "timeZone"),
    });
    if (!saved) return { status: "error", message: "Only the firm's owner can change these settings." };
  } catch (error) {
    return { status: "error", message: await failure(error, session, "Saving firm settings") };
  }
  refresh();
  return { status: "done", message: "Saved." };
}

/** Add vendors from an uploaded CSV file. */
export async function uploadVendors(
  businessId: string,
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const session = await requireSession();
  const file = formData.get("file");
  if (!UUID.test(businessId) || !(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose a CSV file to upload.", issues: [] };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { status: "error", message: "That file is too large. Upload up to 5,000 vendors at a time.", issues: [] };
  }

  const parsed = importPayeesFromCsv(await file.text());
  if (parsed.payees.length === 0) {
    return {
      status: "error",
      message: "No vendors were found in that file.",
      issues: parsed.issues.slice(0, 20),
    };
  }

  try {
    const counts = await importVendors(session.db, businessId, parsed.payees);
    refresh();
    return { status: "done", counts, issues: parsed.issues.slice(0, 20) };
  } catch (error) {
    return { status: "error", message: await failure(error, session, "Importing vendors"), issues: [] };
  }
}

/** Add one vendor by hand. */
export async function addVendor(
  businessId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const name = field(formData, "name");
  const email = field(formData, "email").toLowerCase();
  const amountText = field(formData, "amount");
  const amountPaidCents = amountText === "" ? null : parseMoneyToCents(amountText);

  if (!UUID.test(businessId)) return { status: "error", message: TRY_AGAIN };
  if (name === "" || name.length > 200) {
    return { status: "error", message: "Enter the vendor's name, up to 200 characters." };
  }
  if (email !== "" && (email.length > 254 || !EMAIL_PATTERN.test(email))) {
    return { status: "error", message: "That email address is not valid." };
  }
  if (amountText !== "" && (amountPaidCents === null || amountPaidCents < 0)) {
    return { status: "error", message: "Enter the amount paid as a number, for example 2,450.00." };
  }

  try {
    const counts = await importVendors(session.db, businessId, [
      { name, email: email || null, amountPaidCents },
    ]);
    refresh();
    return {
      status: "done",
      message: counts.added === 1 ? `Added ${name}.` : `${name} was already on the list.`,
    };
  } catch (error) {
    return { status: "error", message: await failure(error, session, "Adding a vendor") };
  }
}

export async function sendRequests(businessId: string): Promise<FormState> {
  const session = await requireSession();
  if (!UUID.test(businessId)) return { status: "error", message: TRY_AGAIN };
  try {
    const queued = await requestW9s(session.db, businessId);
    refresh();
    return {
      status: "done",
      message:
        queued === 0
          ? "Nobody new to ask. Vendors need an email address and must not be on hold."
          : `${plural(queued, "request is", "requests are")} on the way. Emails go out within the hour, during business hours.`,
    };
  } catch (error) {
    return { status: "error", message: await failure(error, session, "Sending W-9 requests") };
  }
}

export async function saveVendor(
  vendorId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const amountText = field(formData, "amount");
  const amountPaidCents = amountText === "" ? null : parseMoneyToCents(amountText);

  if (!UUID.test(vendorId)) return { status: "error", message: TRY_AGAIN };
  if (amountText !== "" && amountPaidCents === null) {
    return { status: "error", message: "Enter the amount paid as a number, for example 2,450.00." };
  }

  try {
    const saved = await updateVendor(session.db, vendorId, {
      name: field(formData, "name"),
      email: field(formData, "email"),
      amountPaidCents,
      legalOrMedical: formData.get("legalOrMedical") === "on",
      onHold: formData.get("onHold") === "on",
    });
    if (!saved) return { status: "error", message: "This vendor is no longer on the list. Reload the page." };
  } catch (error) {
    return { status: "error", message: await failure(error, session, "Saving a vendor") };
  }
  refresh();
  return { status: "done", message: "Saved." };
}

export async function removeVendor(vendorId: string): Promise<FormState> {
  const session = await requireSession();
  if (!UUID.test(vendorId)) return { status: "error", message: TRY_AGAIN };
  try {
    await deleteVendor(session.db, vendorId);
  } catch (error) {
    return { status: "error", message: await failure(error, session, "Removing a vendor") };
  }
  refresh();
  return { status: "done", message: "Removed." };
}

/** The vendor's private W-9 address, for a firm that wants to send it themselves. */
export async function showVendorLink(businessId: string, vendorId: string): Promise<string | null> {
  const session = await requireSession();
  if (!UUID.test(businessId) || !UUID.test(vendorId)) return null;
  try {
    return await vendorLink(session.db, businessId, vendorId);
  } catch (error) {
    console.error("Building a vendor link failed:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}
