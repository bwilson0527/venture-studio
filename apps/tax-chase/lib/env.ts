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
};
