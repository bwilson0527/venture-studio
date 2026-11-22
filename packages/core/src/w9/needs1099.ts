/**
 * First-pass sorting of payees for 1099-NEC season: who is under the
 * threshold, who still owes a W-9, and who likely does or does not need a
 * form. This is a worklist aid for the preparer, who makes the final call;
 * it is not tax advice and does not cover every exception in the IRS
 * instructions for Forms 1099-MISC and 1099-NEC.
 */

/** Line 3a of Form W-9 (Rev. March 2024). */
export type TaxClassification =
  | "individual"
  | "c_corp"
  | "s_corp"
  | "partnership"
  | "trust_estate"
  | "llc_c"
  | "llc_s"
  | "llc_p"
  | "other";

export type Verdict =
  | "below_threshold"
  | "w9_missing"
  | "likely_required"
  | "likely_not_required"
  | "review";

export type Assessment = { verdict: Verdict; reason: string };

export type PayeeFacts = {
  taxYear: number;
  /** Paid by cash, check or bank transfer. Card and app payments go on a 1099-K from the processor. */
  amountPaidCents: number;
  /** Null until the payee has submitted a W-9. */
  w9: { classification: TaxClassification; exemptPayeeCode?: string | null } | null;
  /** Attorney fees and medical or health care payments are reportable even when paid to a corporation. */
  legalOrMedical?: boolean;
};

/**
 * Reporting threshold for nonemployee compensation, in cents. It was $600
 * through tax year 2025 and is $2,000 for payments made in 2026. Later years
 * are indexed for inflation: add each year's figure here when the IRS
 * publishes it.
 */
const THRESHOLD_CENTS_BY_YEAR: Record<number, number> = {
  2026: 200_000,
};

export function thresholdCents(taxYear: number): { cents: number; confirmed: boolean } {
  if (taxYear <= 2025) return { cents: 60_000, confirmed: true };
  const known = THRESHOLD_CENTS_BY_YEAR[taxYear];
  if (known !== undefined) return { cents: known, confirmed: true };
  return { cents: 200_000, confirmed: false };
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

const CORPORATE: ReadonlySet<TaxClassification> = new Set(["c_corp", "s_corp", "llc_c", "llc_s"]);

export function assessPayee(facts: PayeeFacts): Assessment {
  const threshold = thresholdCents(facts.taxYear);

  if (facts.amountPaidCents < threshold.cents) {
    return {
      verdict: "below_threshold",
      reason: `Paid less than ${dollars(threshold.cents)} in ${facts.taxYear}.`,
    };
  }
  if (!threshold.confirmed) {
    return {
      verdict: "review",
      reason: `The ${facts.taxYear} threshold has not been entered yet. Check the current IRS figure.`,
    };
  }
  if (facts.w9 === null) {
    return {
      verdict: "w9_missing",
      reason: `Paid ${dollars(threshold.cents)} or more and no W-9 is on file.`,
    };
  }

  const { classification, exemptPayeeCode } = facts.w9;

  if (CORPORATE.has(classification)) {
    return facts.legalOrMedical
      ? {
          verdict: "likely_required",
          reason: "Taxed as a corporation, but attorney fees and medical payments are still reportable.",
        }
      : {
          verdict: "likely_not_required",
          reason: "Taxed as a corporation. Payments to corporations are generally not reported.",
        };
  }
  if (exemptPayeeCode) {
    return {
      verdict: "review",
      reason: `The payee claimed exemption code ${exemptPayeeCode}. Confirm that it applies.`,
    };
  }
  if (classification === "other") {
    return {
      verdict: "review",
      reason: 'The payee chose "Other" as its tax classification.',
    };
  }
  return {
    verdict: "likely_required",
    reason: `Not a corporation and paid ${dollars(threshold.cents)} or more.`,
  };
}
