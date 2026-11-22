import "server-only";

import { DEFAULT_CADENCE } from "@studio/core/reminders";
import { derivePortalToken } from "@studio/core/tokens";
import { buildW9Email, planW9Email } from "@studio/core/w9/emails";

import { BRAND } from "./brand";
import { EmailError, sendEmail } from "./email";
import { serverEnv } from "./env";
import { adminClient } from "./supabase-admin";

/**
 * The scheduled job that sends W-9 requests and reminders.
 *
 * For each payee who may be due: decide what to send, claim them so an
 * overlapping run skips them, send, and record the outcome. A failure is
 * recorded and retried by a later run; three in a row stop the retries.
 */

type Candidate = {
  payee_id: string;
  payee_name: string;
  email: string;
  firm_name: string;
  reply_to_email: string | null;
  time_zone: string;
  business_name: string;
  tax_year: number;
  portal_token_version: number;
  portal_token_hash: string;
  request_sent_at: string | null;
  reminders_sent: number;
  last_reminder_at: string | null;
};

export type W9EmailRun = {
  considered: number;
  requestsSent: number;
  remindersSent: number;
  failed: number;
  /** Not due yet, or taken by another run. */
  skipped: number;
  /** True if the provider asked us to slow down and the run ended early. */
  stoppedEarly: boolean;
};

/** Pause between sends, to stay under the provider's rate limit. */
const SEND_GAP_MS = 600;

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await adminClient().rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.code} ${error.message}`);
  return data as T;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export async function runW9Emails(now: Date, limit: number): Promise<W9EmailRun> {
  const run: W9EmailRun = {
    considered: 0,
    requestsSent: 0,
    remindersSent: 0,
    failed: 0,
    skipped: 0,
    stoppedEarly: false,
  };

  // Read every setting up front, so a missing one stops the run before any
  // payee is claimed.
  const { appUrl, portalTokenSecret } = serverEnv;
  void serverEnv.resendApiKey;
  void serverEnv.emailFrom;

  const candidates = await rpc<Candidate[]>("w9_email_candidates", {
    p_limit: limit,
    p_min_gap_days: Math.min(DEFAULT_CADENCE.firstAfterDays, DEFAULT_CADENCE.everyDays),
  });

  let sentAny = false;
  for (const candidate of candidates ?? []) {
    run.considered += 1;

    const plan = planW9Email(
      {
        requestSentAt: candidate.request_sent_at ? new Date(candidate.request_sent_at) : null,
        remindersSent: candidate.reminders_sent,
        lastReminderAt: candidate.last_reminder_at ? new Date(candidate.last_reminder_at) : null,
      },
      now,
      {
        ...DEFAULT_CADENCE,
        timeZone: isValidTimeZone(candidate.time_zone)
          ? candidate.time_zone
          : DEFAULT_CADENCE.timeZone,
      },
    );
    if (!plan) {
      run.skipped += 1;
      continue;
    }

    const claimed = await rpc<boolean>("claim_w9_email", {
      p_payee_id: candidate.payee_id,
      p_reminders_sent: candidate.reminders_sent,
    });
    if (!claimed) {
      run.skipped += 1;
      continue;
    }

    try {
      const link = derivePortalToken(
        portalTokenSecret,
        candidate.payee_id,
        candidate.portal_token_version,
      );
      // Never email a link that would not open.
      if (link.hash !== candidate.portal_token_hash) {
        throw new EmailError("the derived link does not match the one on file", false);
      }

      const formUrl = `${appUrl}/w9/${link.token}`;
      const email = buildW9Email({
        plan,
        payeeName: candidate.payee_name,
        firmName: candidate.firm_name,
        businessName: candidate.business_name,
        taxYear: candidate.tax_year,
        formUrl,
        stopUrl: `${formUrl}/stop`,
        brandName: BRAND.name,
        repliesReachFirm: Boolean(candidate.reply_to_email),
      });

      if (sentAny) await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
      sentAny = true;

      const messageId = await sendEmail({
        to: candidate.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
        replyTo: candidate.reply_to_email,
        headers: {
          "List-Unsubscribe": `<${appUrl}/api/w9/stop?t=${link.token}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        idempotencyKey: `w9-${candidate.payee_id}-${plan.kind}-${candidate.reminders_sent}`,
      });

      await rpc("complete_w9_email", {
        p_payee_id: candidate.payee_id,
        p_kind: plan.kind,
        p_provider_message_id: messageId,
      });
      if (plan.kind === "request") run.requestsSent += 1;
      else run.remindersSent += 1;
    } catch (error) {
      if (error instanceof EmailError && error.rateLimited) {
        // Not this payee's fault: leave the claim to lapse and try next run.
        run.stoppedEarly = true;
        break;
      }
      run.failed += 1;
      await rpc("fail_w9_email", {
        p_payee_id: candidate.payee_id,
        p_kind: plan.kind,
        p_error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return run;
}
