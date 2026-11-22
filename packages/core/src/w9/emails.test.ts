import { describe, expect, it } from "vitest";
import { DEFAULT_CADENCE } from "../reminders/cadence";
import { buildW9Email, planW9Email, type W9EmailInput } from "./emails";

// Noon in New York on a weekday, inside the sending window.
const noon = new Date("2026-12-10T17:00:00Z");
const daysBefore = (days: number) => new Date(noon.getTime() - days * 86_400_000);

describe("planW9Email", () => {
  it("sends the first request straight away, whatever the hour", () => {
    const midnight = new Date("2026-12-10T05:00:00Z");
    expect(
      planW9Email({ requestSentAt: null, remindersSent: 0, lastReminderAt: null }, midnight),
    ).toEqual({ kind: "request" });
  });

  it("waits three days before the first reminder", () => {
    const state = (days: number) => ({
      requestSentAt: daysBefore(days),
      remindersSent: 0,
      lastReminderAt: null,
    });
    expect(planW9Email(state(2), noon)).toBeNull();
    expect(planW9Email(state(3), noon)).toEqual({ kind: "reminder", number: 1, isLast: false });
  });

  it("spaces later reminders four days apart", () => {
    const state = (days: number) => ({
      requestSentAt: daysBefore(20),
      remindersSent: 2,
      lastReminderAt: daysBefore(days),
    });
    expect(planW9Email(state(3), noon)).toBeNull();
    expect(planW9Email(state(4), noon)).toEqual({ kind: "reminder", number: 3, isLast: false });
  });

  it("holds a due reminder until sending hours", () => {
    const night = new Date("2026-12-10T04:00:00Z");
    expect(
      planW9Email({ requestSentAt: daysBefore(5), remindersSent: 0, lastReminderAt: null }, night),
    ).toBeNull();
  });

  it("marks the final reminder and then stops", () => {
    const max = DEFAULT_CADENCE.maxReminders;
    expect(
      planW9Email(
        { requestSentAt: daysBefore(40), remindersSent: max - 1, lastReminderAt: daysBefore(5) },
        noon,
      ),
    ).toEqual({ kind: "reminder", number: max, isLast: true });
    expect(
      planW9Email(
        { requestSentAt: daysBefore(40), remindersSent: max, lastReminderAt: daysBefore(5) },
        noon,
      ),
    ).toBeNull();
  });

  it("uses the firm's own time zone for sending hours", () => {
    // 17:00 UTC is 7 in the morning in Honolulu.
    expect(
      planW9Email({ requestSentAt: daysBefore(5), remindersSent: 0, lastReminderAt: null }, noon, {
        ...DEFAULT_CADENCE,
        timeZone: "Pacific/Honolulu",
      }),
    ).toBeNull();
  });
});

const base: W9EmailInput = {
  plan: { kind: "request" },
  payeeName: "Rivera Design",
  firmName: "Lakeside Bookkeeping",
  businessName: "Harbor Street Bakery",
  taxYear: 2026,
  formUrl: "https://example.test/w9/abc",
  stopUrl: "https://example.test/w9/abc/stop",
  brandName: "FormStickler",
  repliesReachFirm: true,
};

describe("buildW9Email", () => {
  it("writes a request that says who is asking, why, and where to go", () => {
    const email = buildW9Email(base);
    expect(email.subject).toBe("Harbor Street Bakery needs your Form W-9 for 2026");
    for (const body of [email.text, email.html]) {
      expect(body).toContain("Rivera Design");
      expect(body).toContain("Lakeside Bookkeeping");
      expect(body).toContain("Harbor Street Bakery");
      expect(body).toContain("https://example.test/w9/abc");
      expect(body).toContain("https://example.test/w9/abc/stop");
      expect(body).toContain("FormStickler");
    }
    expect(email.text).toContain("Reply to this email to reach Lakeside Bookkeeping.");
  });

  it("words reminders and the last reminder differently", () => {
    const reminder = buildW9Email({ ...base, plan: { kind: "reminder", number: 2, isLast: false } });
    expect(reminder.subject).toBe("Reminder: Harbor Street Bakery still needs your Form W-9");
    expect(reminder.text).toContain("A quick reminder");

    const last = buildW9Email({ ...base, plan: { kind: "reminder", number: 8, isLast: true } });
    expect(last.subject).toBe("Last reminder: Harbor Street Bakery still needs your Form W-9");
    expect(last.text).toContain("This is the last reminder we will send.");
  });

  it("does not invite replies nobody will read", () => {
    const email = buildW9Email({ ...base, repliesReachFirm: false });
    expect(email.text).toContain("Replies to this address are not read.");
    expect(email.text).not.toContain("Reply to this email");
  });

  it("escapes names in the HTML body", () => {
    const email = buildW9Email({
      ...base,
      payeeName: `<script>alert("x")</script>`,
      businessName: "Salt & Vine <b>Bistro</b>",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>Bistro</b>");
    expect(email.html).toContain("Salt &amp; Vine &lt;b&gt;Bistro&lt;/b&gt;");
    expect(email.text).toContain("Salt & Vine <b>Bistro</b>");
  });

  it("keeps line breaks in a name out of the subject", () => {
    const email = buildW9Email({ ...base, businessName: "Bakery\r\nBcc: someone@example.com" });
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.subject).toContain("Bakery Bcc: someone@example.com needs your Form W-9");
  });
});
