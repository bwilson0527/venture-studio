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
};
