import {
  DEFAULT_CADENCE,
  isReminderDue,
  type CadenceConfig,
} from "../reminders/cadence";

/**
 * The emails that ask a payee for their W-9: when each one is due, and what
 * it says. Pure functions; sending and record-keeping live in the app.
 */

export type W9EmailPlan =
  | { kind: "request" }
  | { kind: "reminder"; number: number; isLast: boolean };

/** What the scheduler knows about a payee whose W-9 is outstanding. */
export type W9EmailState = {
  /** When the first request email went out. Null if it has not yet. */
  requestSentAt: Date | null;
  remindersSent: number;
  lastReminderAt: Date | null;
};

/**
 * Decide what, if anything, to send a payee right now.
 *
 * The first request goes out as soon as the firm asks for it. Reminders
 * follow the cadence and only inside its sending hours, so nobody is
 * emailed about tax forms at midnight.
 */
export function planW9Email(
  state: W9EmailState,
  now: Date,
  config: CadenceConfig = DEFAULT_CADENCE,
): W9EmailPlan | null {
  if (state.requestSentAt === null) return { kind: "request" };

  const due = isReminderDue(
    {
      requestedAt: state.requestSentAt,
      remindersSent: state.remindersSent,
      lastReminderAt: state.lastReminderAt,
      complete: false,
      paused: false,
    },
    now,
    config,
  );
  if (!due) return null;

  const number = state.remindersSent + 1;
  return { kind: "reminder", number, isLast: number >= config.maxReminders };
}

export type W9EmailInput = {
  plan: W9EmailPlan;
  payeeName: string;
  firmName: string;
  /** The client business that paid the payee. */
  businessName: string;
  taxYear: number;
  /** The payee's private W-9 link. */
  formUrl: string;
  /** Where the payee can turn reminders off. */
  stopUrl: string;
  brandName: string;
  /** True when replies reach the firm, which changes the closing line. */
  repliesReachFirm: boolean;
};

export type W9Email = { subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Keep a name from breaking out of a subject line or adding headers. */
function oneLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

export function buildW9Email(input: W9EmailInput): W9Email {
  const payee = oneLine(input.payeeName);
  const firm = oneLine(input.firmName);
  const business = oneLine(input.businessName);
  const brand = oneLine(input.brandName);
  const { plan, taxYear, formUrl, stopUrl } = input;

  const subject =
    plan.kind === "request"
      ? `${business} needs your Form W-9 for ${taxYear}`
      : plan.isLast
        ? `Last reminder: ${business} still needs your Form W-9`
        : `Reminder: ${business} still needs your Form W-9`;

  const opening =
    plan.kind === "request"
      ? `${firm} prepares year-end tax forms for ${business}. Because ${business} paid you in ${taxYear}, they need a completed Form W-9 from you.`
      : plan.isLast
        ? `This is the last reminder we will send. ${business} still needs a completed Form W-9 from you for payments made in ${taxYear}, and ${firm} has not received it.`
        : `A quick reminder: ${business} still needs a completed Form W-9 from you for payments made in ${taxYear}. ${firm}, which prepares their tax forms, has not received it yet.`;

  const how =
    "You can fill it in and sign it online in about two minutes. There is nothing to print or scan.";
  const privacy = "This link is private to you, so please do not forward it.";
  const why =
    "Why you are being asked: a business uses the W-9 to report what it paid a vendor or contractor to the IRS correctly. A payer that does not have your taxpayer ID can be required to withhold part of future payments.";
  const check = `If you are not sure this request is genuine, contact ${business} before entering anything.`;
  const questions = input.repliesReachFirm
    ? `Questions? Reply to this email to reach ${firm}.`
    : `Questions? Please contact ${firm} or ${business} directly. Replies to this address are not read.`;
  const footer = `Sent by ${brand} on behalf of ${firm}.`;

  const text = [
    `Hello ${payee},`,
    opening,
    how,
    `Open your form: ${formUrl}`,
    privacy,
    why,
    check,
    questions,
    `${footer}\nTo stop these reminders: ${stopUrl}`,
  ].join("\n\n");

  const p = (content: string) =>
    `<p style="margin:0 0 16px;line-height:1.55;">${content}</p>`;
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#faf9f6;color:#1a1a17;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e0d8;border-radius:10px;padding:28px;">
${p(`Hello ${escapeHtml(payee)},`)}
${p(escapeHtml(opening))}
${p(escapeHtml(how))}
<p style="margin:0 0 20px;"><a href="${escapeHtml(formUrl)}" style="display:inline-block;background:#1a1a17;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:6px;">Open your Form W-9</a></p>
${p(escapeHtml(privacy))}
${p(`<span style="color:#5f5e58;">${escapeHtml(why)}</span>`)}
${p(`<span style="color:#5f5e58;">${escapeHtml(check)}</span>`)}
${p(escapeHtml(questions))}
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e0d8;font-size:13px;line-height:1.5;color:#5f5e58;">${escapeHtml(footer)} <a href="${escapeHtml(stopUrl)}" style="color:#5f5e58;">Stop these reminders</a>.</p>
</div>
</body>
</html>`;

  return { subject, text, html };
}
