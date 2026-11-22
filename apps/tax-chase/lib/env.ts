import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Server-side settings, read when first used so a build needs none of them. */
export const serverEnv = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  /**
   * The publishable (anon) key. Signed-in firm users reach the database with
   * it plus their own session, so row level security applies to them.
   */
  get supabasePublishableKey() {
    return required("SUPABASE_PUBLISHABLE_KEY");
  },
  /** The secret (service role) key. Bypasses row level security: server only. */
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  /** 32 random bytes, base64. Taxpayer IDs are encrypted with it before storage. */
  get tinEncryptionKey() {
    return required("TIN_ENCRYPTION_KEY");
  },
  /** Payee links are derived from this, so they can be rebuilt for each email. */
  get portalTokenSecret() {
    return required("PORTAL_TOKEN_SECRET");
  },
  /** The public address of the app, without a trailing slash. Used in email links. */
  get appUrl() {
    return required("APP_URL").replace(/\/+$/, "");
  },
  get resendApiKey() {
    return required("RESEND_API_KEY");
  },
  /** For example: FormStickler <requests@example.com>. */
  get emailFrom() {
    return required("EMAIL_FROM");
  },
  /** Overridden only in local tests. */
  get resendApiUrl() {
    return (process.env.RESEND_API_URL || "https://api.resend.com").replace(/\/+$/, "");
  },
  /** Shared with the scheduler that calls the cron routes. */
  get cronSecret() {
    return required("CRON_SECRET");
  },
  /** Paid plans are switched off until Stripe's secret key is set. */
  get billingEnabled() {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  },
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  /** The signing secret of the webhook endpoint in Stripe. Starts with whsec_. */
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  /** Overridden only in local tests. */
  get stripeApiUrl() {
    return (process.env.STRIPE_API_URL || "https://api.stripe.com").replace(/\/+$/, "");
  },
};
