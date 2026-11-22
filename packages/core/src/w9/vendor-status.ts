import { assessPayee, type TaxClassification, type Verdict } from "./needs1099";

/**
 * What the firm's vendor board says about one vendor: where their W-9
 * stands, and the first-pass 1099 sort. Wording only; no taxpayer ID is
 * involved beyond the last four digits.
 */

export type Tone = "done" | "wait" | "skip";
export type StatusLine = { label: string; tone: Tone; detail: string };

export type VendorFacts = {
  email: string | null;
  amountPaidCents: number | null;
  legalOrMedical: boolean;
  status: "not_requested" | "requested" | "submitted";
  onHold: boolean;
  remindersStopped: boolean;
  emailFailing: boolean;
  requestSentAt: string | null;
  remindersSent: number;
  lastReminderAt: string | null;
  w9: {
    classification: TaxClassification;
    exemptPayeeCode: string | null;
    tinType: "ssn" | "ein";
    tinLast4: string;
    backupWithholding: boolean;
    signedAt: string;
  } | null;
};

const VERDICT_LABEL: Record<Verdict, { label: string; tone: Tone }> = {
  below_threshold: { label: "Under threshold", tone: "skip" },
  w9_missing: { label: "W-9 needed", tone: "wait" },
  likely_required: { label: "1099 likely", tone: "done" },
  likely_not_required: { label: "No 1099 likely", tone: "skip" },
  review: { label: "Review", tone: "wait" },
};

function times(count: number): string {
  return count === 1 ? "once" : count === 2 ? "twice" : `${count} times`;
}

/** `day` turns a timestamp into a short date in the firm's time zone. */
export function w9Status(vendor: VendorFacts, day: (iso: string) => string): StatusLine {
  if (vendor.w9) {
    const id = `${vendor.w9.tinType.toUpperCase()} ending ${vendor.w9.tinLast4}`;
    const withholding = vendor.w9.backupWithholding ? " · subject to backup withholding" : "";
    return {
      label: "Received",
      tone: "done",
      detail: `${id} · signed ${day(vendor.w9.signedAt)}${withholding}`,
    };
  }
  if (vendor.onHold) {
    return { label: "On hold", tone: "skip", detail: "No emails are sent while on hold." };
  }
  if (!vendor.email) {
    return {
      label: "No email",
      tone: "wait",
      detail: "Add an email, or copy the private link and send it yourself.",
    };
  }
  if (vendor.status === "not_requested") {
    return { label: "Not asked", tone: "skip", detail: "Send requests to ask for the W-9." };
  }
  if (vendor.remindersStopped) {
    return {
      label: "Reminders stopped",
      tone: "wait",
      detail: "The vendor turned reminders off. Contact them directly.",
    };
  }
  if (vendor.emailFailing) {
    return {
      label: "Email failing",
      tone: "wait",
      detail: "Emails to this address are not going through. Check the address.",
    };
  }
  if (!vendor.requestSentAt) {
    return { label: "Queued", tone: "wait", detail: "The request goes out within the hour." };
  }
  if (vendor.remindersSent === 0 || !vendor.lastReminderAt) {
    return { label: "Asked", tone: "wait", detail: `Asked ${day(vendor.requestSentAt)}` };
  }
  return {
    label: `Reminded ${times(vendor.remindersSent)}`,
    tone: "wait",
    detail: `Last reminder ${day(vendor.lastReminderAt)}`,
  };
}

/** The part of a vendor the 1099 sort looks at. */
export type SortFacts = {
  amountPaidCents: number | null;
  legalOrMedical: boolean;
  w9: { classification: TaxClassification; exemptPayeeCode: string | null } | null;
};

export function form1099Status(vendor: SortFacts, taxYear: number): StatusLine {
  if (vendor.amountPaidCents === null) {
    return { label: "No amount", tone: "skip", detail: "Enter what was paid to sort this vendor." };
  }
  const assessment = assessPayee({
    taxYear,
    amountPaidCents: vendor.amountPaidCents,
    w9: vendor.w9
      ? { classification: vendor.w9.classification, exemptPayeeCode: vendor.w9.exemptPayeeCode }
      : null,
    legalOrMedical: vendor.legalOrMedical,
  });
  return { ...VERDICT_LABEL[assessment.verdict], detail: assessment.reason };
}
