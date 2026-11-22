import { describe, expect, it } from "vitest";

import { form1099Status, w9Status, type VendorFacts } from "./vendor-status";

const day = (iso: string) => iso.slice(0, 10);

const base: VendorFacts = {
  email: "vendor@example.com",
  amountPaidCents: 500_000,
  legalOrMedical: false,
  status: "not_requested",
  onHold: false,
  remindersStopped: false,
  emailFailing: false,
  requestSentAt: null,
  remindersSent: 0,
  lastReminderAt: null,
  w9: null,
};

const signed: VendorFacts["w9"] = {
  classification: "c_corp",
  exemptPayeeCode: null,
  tinType: "ein",
  tinLast4: "4321",
  backupWithholding: false,
  signedAt: "2026-11-22T15:00:00Z",
};

describe("w9Status", () => {
  it("shows a received W-9 with the last four digits only", () => {
    const line = w9Status({ ...base, status: "submitted", w9: signed }, day);
    expect(line).toEqual({ label: "Received", tone: "done", detail: "EIN ending 4321 · signed 2026-11-22" });
  });

  it("flags backup withholding on a received W-9", () => {
    const line = w9Status({ ...base, status: "submitted", w9: { ...signed, backupWithholding: true } }, day);
    expect(line.detail).toContain("subject to backup withholding");
  });

  it("puts a received W-9 ahead of everything else", () => {
    const line = w9Status(
      { ...base, status: "submitted", w9: signed, onHold: true, email: null, emailFailing: true },
      day,
    );
    expect(line.label).toBe("Received");
  });

  it("walks a request from not asked to reminded", () => {
    expect(w9Status(base, day).label).toBe("Not asked");
    const requested = { ...base, status: "requested" as const };
    expect(w9Status(requested, day).label).toBe("Queued");
    const asked = { ...requested, requestSentAt: "2026-11-20T15:00:00Z" };
    expect(w9Status(asked, day)).toMatchObject({ label: "Asked", detail: "Asked 2026-11-20" });
    const once = { ...asked, remindersSent: 1, lastReminderAt: "2026-11-23T15:00:00Z" };
    expect(w9Status(once, day)).toMatchObject({
      label: "Reminded once",
      detail: "Last reminder 2026-11-23",
    });
    expect(w9Status({ ...once, remindersSent: 2 }, day).label).toBe("Reminded twice");
    expect(w9Status({ ...once, remindersSent: 5 }, day).label).toBe("Reminded 5 times");
  });

  it("says why nothing is being sent", () => {
    const requested = { ...base, status: "requested" as const, requestSentAt: "2026-11-20T15:00:00Z" };
    expect(w9Status({ ...requested, onHold: true }, day).label).toBe("On hold");
    expect(w9Status({ ...requested, email: null }, day).label).toBe("No email");
    expect(w9Status({ ...base, email: null }, day).label).toBe("No email");
    expect(w9Status({ ...requested, remindersStopped: true }, day).label).toBe("Reminders stopped");
    expect(w9Status({ ...requested, emailFailing: true }, day).label).toBe("Email failing");
  });

  it("does not call a vendor who was never asked a failing address", () => {
    expect(w9Status({ ...base, emailFailing: true }, day).label).toBe("Not asked");
  });
});

describe("form1099Status", () => {
  it("asks for an amount before sorting", () => {
    expect(form1099Status({ ...base, amountPaidCents: null }, 2026).label).toBe("No amount");
  });

  it("uses the 2026 threshold", () => {
    expect(form1099Status({ ...base, amountPaidCents: 199_999 }, 2026).label).toBe("Under threshold");
    expect(form1099Status({ ...base, amountPaidCents: 200_000 }, 2026).label).toBe("W-9 needed");
  });

  it("sorts by the W-9 once it is in", () => {
    const corp = { ...base, status: "submitted" as const, w9: signed };
    expect(form1099Status(corp, 2026).label).toBe("No 1099 likely");
    expect(form1099Status({ ...corp, legalOrMedical: true }, 2026).label).toBe("1099 likely");
    const person = { ...corp, w9: { ...signed, classification: "individual" as const } };
    expect(form1099Status(person, 2026).label).toBe("1099 likely");
    const exempt = { ...person, w9: { ...person.w9, exemptPayeeCode: "5" } };
    expect(form1099Status(exempt, 2026).label).toBe("Review");
  });
});
