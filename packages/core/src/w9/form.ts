import type { TaxClassification } from "./needs1099";
import { checkTin, type TinType } from "./tin";

/**
 * The electronic Form W-9 a payee fills in: the certification wording, and
 * the checks applied to their answers before anything is stored.
 *
 * The certification text is the language of the paper Form W-9
 * (Rev. March 2024), which the IRS requires an electronic signature to be
 * made under. Do not reword it. If the IRS revises the form, add a new
 * version here rather than editing this one, because stored signatures
 * point at the version the payee actually saw.
 */
export const W9_CERTIFICATION_VERSION = "w9-2024-03";

export const W9_CERTIFICATION = {
  version: W9_CERTIFICATION_VERSION,
  formRevision: "Form W-9 (Rev. March 2024)",
  leadIn: "Under penalties of perjury, I certify that:",
  items: [
    "The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); and",
    "I am not subject to backup withholding because (a) I am exempt from backup withholding, or (b) I have not been notified by the Internal Revenue Service (IRS) that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding; and",
    "I am a U.S. citizen or other U.S. person (defined below); and",
    "The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.",
  ],
  /** Index into `items` of the backup withholding statement a payee may have to strike. */
  backupWithholdingItem: 1,
  crossOutInstruction:
    "You must cross out item 2 above if you have been notified by the IRS that you are currently subject to backup withholding because you have failed to report all interest and dividends on your tax return.",
  usPersonDefinition:
    "For federal tax purposes, you are considered a U.S. person if you are an individual who is a U.S. citizen or U.S. resident alien; a partnership, corporation, company, or association created or organized in the United States or under the laws of the United States; an estate (other than a foreign estate); or a domestic trust.",
  consentStatement:
    "The IRS does not require your consent to any provision of this document other than the certifications required to avoid backup withholding.",
} as const;

/** The seven boxes of line 3a, in the order the form prints them. */
export const W9_CLASSIFICATION_CHOICES = [
  { value: "individual", label: "Individual/sole proprietor" },
  { value: "c_corp", label: "C corporation" },
  { value: "s_corp", label: "S corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "trust_estate", label: "Trust/estate" },
  { value: "llc", label: "LLC" },
  { value: "other", label: "Other" },
] as const;

export type W9ClassificationChoice = (typeof W9_CLASSIFICATION_CHOICES)[number]["value"];

/** States, the District of Columbia, territories and military mail codes. */
export const US_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "AS", "GU", "MP", "PR", "VI", "AA", "AE", "AP",
] as const;

/** What the form posts. Everything is a string, as a browser sends it. */
export type W9FormInput = {
  legalName?: string;
  businessName?: string;
  classification?: string;
  /** C, S or P. Only when the classification is LLC. */
  llcClassification?: string;
  otherClassification?: string;
  hasForeignPartners?: string;
  exemptPayeeCode?: string;
  fatcaCode?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  tinType?: string;
  tin?: string;
  backupWithholding?: string;
  certify?: string;
  signedName?: string;
};

export type W9FormField = keyof W9FormInput;

export type W9Submission = {
  legalName: string;
  businessName: string | null;
  taxClassification: TaxClassification;
  otherClassification: string | null;
  hasForeignPartners: boolean;
  exemptPayeeCode: string | null;
  fatcaExemptionCode: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  tinType: TinType;
  /** Nine digits. Encrypt before storing; never log. */
  tin: string;
  tinLast4: string;
  backupWithholding: boolean;
  signedName: string;
  certificationVersion: string;
};

export type W9FormResult =
  | { ok: true; value: W9Submission; warnings: Partial<Record<W9FormField, string>> }
  | { ok: false; errors: Partial<Record<W9FormField, string>> };

const MAX_TEXT = 200;
/** Classifications that always have their own EIN. */
const EIN_ONLY = new Set<TaxClassification>([
  "c_corp",
  "s_corp",
  "partnership",
  "llc_c",
  "llc_s",
  "llc_p",
]);
/** Line 3b applies only to these. */
const LINE_3B = new Set<TaxClassification>(["partnership", "trust_estate", "llc_p"]);

function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isChecked(value: string | undefined): boolean {
  return value === "on" || value === "true" || value === "yes";
}

function resolveClassification(
  choice: string,
  llc: string,
): TaxClassification | { field: W9FormField; error: string } {
  switch (choice) {
    case "individual":
    case "c_corp":
    case "s_corp":
    case "partnership":
    case "trust_estate":
    case "other":
      return choice;
    case "llc": {
      const letter = llc.toUpperCase();
      if (letter === "C") return "llc_c";
      if (letter === "S") return "llc_s";
      if (letter === "P") return "llc_p";
      return {
        field: "llcClassification",
        error: "Choose how the LLC is taxed: C corporation, S corporation or partnership.",
      };
    }
    default:
      return { field: "classification", error: "Choose a federal tax classification." };
  }
}

export function validateW9Form(input: W9FormInput): W9FormResult {
  const errors: Partial<Record<W9FormField, string>> = {};
  const warnings: Partial<Record<W9FormField, string>> = {};

  const text = (field: W9FormField, label: string, required: boolean): string => {
    const value = clean(input[field]);
    if (required && value === "") errors[field] = `Enter ${label}.`;
    else if (value.length > MAX_TEXT) errors[field] = `Keep ${label} under ${MAX_TEXT} characters.`;
    return value;
  };

  const legalName = text("legalName", "the name shown on your tax return", true);
  const businessName = text("businessName", "the business name", false);
  const addressLine1 = text("addressLine1", "your street address", true);
  const addressLine2 = text("addressLine2", "the second address line", false);
  const city = text("city", "your city", true);
  const signedName = text("signedName", "your full name as your signature", true);

  const classification = resolveClassification(
    clean(input.classification),
    clean(input.llcClassification),
  );
  let taxClassification: TaxClassification | null = null;
  if (typeof classification === "string") taxClassification = classification;
  else errors[classification.field] = classification.error;

  let otherClassification = "";
  if (taxClassification === "other") {
    otherClassification = text("otherClassification", "your tax classification", true);
  }

  const state = clean(input.state).toUpperCase();
  if (!(US_STATE_CODES as readonly string[]).includes(state)) {
    errors.state = "Choose a state.";
  }

  const postalCode = clean(input.postalCode);
  if (!/^\d{5}(-\d{4})?$/.test(postalCode)) {
    errors.postalCode = "Enter a ZIP code like 78701 or 78701-1234.";
  }

  const exemptPayeeCode = clean(input.exemptPayeeCode);
  if (exemptPayeeCode !== "" && !/^(?:[1-9]|1[0-3])$/.test(exemptPayeeCode)) {
    errors.exemptPayeeCode = "Exempt payee codes run from 1 to 13. Leave this blank if you are not sure.";
  } else if (exemptPayeeCode !== "" && taxClassification === "individual") {
    errors.exemptPayeeCode = "Exempt payee codes do not apply to individuals. Leave this blank.";
  }

  const fatcaCode = clean(input.fatcaCode).toUpperCase();
  if (fatcaCode !== "" && !/^[A-M]$/.test(fatcaCode)) {
    errors.fatcaCode = "FATCA codes run from A to M. Leave this blank if you are not sure.";
  }

  const tinType = clean(input.tinType);
  let tin: { digits: string; last4: string } | null = null;
  if (tinType !== "ssn" && tinType !== "ein") {
    errors.tinType = "Choose a Social Security number or an Employer Identification Number.";
  } else if (tinType === "ssn" && taxClassification && EIN_ONLY.has(taxClassification)) {
    errors.tinType =
      "A corporation, partnership or LLC taxed as one gives its Employer Identification Number.";
  } else {
    const checked = checkTin(tinType, input.tin ?? "");
    if (clean(input.tin) === "") errors.tin = "Enter your taxpayer identification number.";
    else if (!checked.ok) errors.tin = checked.error;
    else {
      tin = { digits: checked.digits, last4: checked.last4 };
      if (checked.warning) warnings.tin = checked.warning;
    }
  }

  if (!isChecked(input.certify)) {
    errors.certify = "Check the box to certify under penalties of perjury.";
  }

  if (Object.keys(errors).length > 0 || !taxClassification || !tin) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    warnings,
    value: {
      legalName,
      businessName: businessName || null,
      taxClassification,
      otherClassification: otherClassification || null,
      hasForeignPartners: LINE_3B.has(taxClassification) && isChecked(input.hasForeignPartners),
      exemptPayeeCode: exemptPayeeCode || null,
      fatcaExemptionCode: fatcaCode || null,
      addressLine1,
      addressLine2: addressLine2 || null,
      city,
      state,
      postalCode,
      tinType: tinType as TinType,
      tin: tin.digits,
      tinLast4: tin.last4,
      backupWithholding: isChecked(input.backupWithholding),
      signedName,
      certificationVersion: W9_CERTIFICATION_VERSION,
    },
  };
}
