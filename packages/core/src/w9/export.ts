import { toCsv, type CsvCell } from "../csv";
import type { TaxClassification } from "./needs1099";
import { maskTin, type TinType } from "./tin";
import { form1099Status } from "./vendor-status";

/**
 * The spreadsheet a firm takes to its 1099 filing tool: one row per vendor
 * of a client business, with the W-9 details and the first-pass 1099 sort.
 *
 * This is a general layout with plain column names. Filing tools let you
 * map columns on import, and several publish their own templates; presets
 * for specific tools can be added here once their layouts are confirmed.
 */

export type ExportVendor = {
  name: string;
  email: string | null;
  amountPaidCents: number | null;
  legalOrMedical: boolean;
  w9: {
    legalName: string;
    businessName: string | null;
    classification: TaxClassification;
    otherClassification: string | null;
    exemptPayeeCode: string | null;
    fatcaCode: string | null;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    postalCode: string;
    tinType: TinType;
    tinLast4: string;
    /** Nine digits. Null in a last-four export. */
    tin: string | null;
    backupWithholding: boolean;
    signedName: string;
    signedAt: string;
  } | null;
};

const CLASSIFICATION_LABEL: Record<TaxClassification, string> = {
  individual: "Individual/sole proprietor",
  c_corp: "C corporation",
  s_corp: "S corporation",
  partnership: "Partnership",
  trust_estate: "Trust/estate",
  llc_c: "LLC taxed as C corporation",
  llc_s: "LLC taxed as S corporation",
  llc_p: "LLC taxed as partnership",
  other: "Other",
};

/** A taxpayer ID as it is written on forms: 123-45-6789 or 12-3456789. */
export function formatTin(type: TinType, digits: string): string {
  if (!/^\d{9}$/.test(digits)) throw new Error("A taxpayer ID must be nine digits");
  return type === "ssn"
    ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
    : `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function w9ExportHeader(taxYear: number): string[] {
  return [
    "Vendor",
    "Email",
    `Paid in ${taxYear}`,
    "1099 sort",
    "Reason",
    "W-9",
    "Name on W-9",
    "Business name",
    "Tax classification",
    "Exempt payee code",
    "FATCA code",
    "Address",
    "Address line 2",
    "City",
    "State",
    "ZIP",
    "TIN type",
    "TIN",
    "Backup withholding",
    "Attorney or medical",
    "Signed by",
    "Signed on",
  ];
}

function row(vendor: ExportVendor, taxYear: number): CsvCell[] {
  const sort = form1099Status(
    {
      amountPaidCents: vendor.amountPaidCents,
      legalOrMedical: vendor.legalOrMedical,
      w9: vendor.w9
        ? { classification: vendor.w9.classification, exemptPayeeCode: vendor.w9.exemptPayeeCode }
        : null,
    },
    taxYear,
  );
  const w9 = vendor.w9;
  const classification = w9
    ? w9.classification === "other" && w9.otherClassification
      ? `Other: ${w9.otherClassification}`
      : CLASSIFICATION_LABEL[w9.classification]
    : null;

  return [
    vendor.name,
    vendor.email,
    vendor.amountPaidCents === null ? null : vendor.amountPaidCents / 100,
    sort.label,
    sort.detail,
    w9 ? "Received" : "Missing",
    w9?.legalName,
    w9?.businessName,
    classification,
    w9?.exemptPayeeCode,
    w9?.fatcaCode,
    w9?.addressLine1,
    w9?.addressLine2,
    w9?.city,
    w9?.state,
    w9?.postalCode,
    w9?.tinType.toUpperCase(),
    w9 ? (w9.tin ? formatTin(w9.tinType, w9.tin) : maskTin(w9.tinType, w9.tinLast4)) : null,
    w9 ? (w9.backupWithholding ? "Yes" : "No") : null,
    vendor.legalOrMedical ? "Yes" : "No",
    w9?.signedName,
    w9?.signedAt.slice(0, 10),
  ];
}

/** The export as CSV text, starting with a byte-order mark so Excel reads it as UTF-8. */
export function buildW9ExportCsv(vendors: ExportVendor[], taxYear: number): string {
  return (
    "﻿" +
    toCsv(
      w9ExportHeader(taxYear),
      vendors.map((vendor) => row(vendor, taxYear)),
    )
  );
}

/** For example "harbor-street-bakery-2026-w9s.csv". */
export function w9ExportFileName(businessName: string, taxYear: number, includeTins: boolean): string {
  const slug =
    businessName
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "client";
  return `${slug}-${taxYear}-w9s${includeTins ? "" : "-last4"}.csv`;
}
