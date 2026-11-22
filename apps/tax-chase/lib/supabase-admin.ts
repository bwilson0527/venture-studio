import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "./env";

let client: SupabaseClient | undefined;

/**
 * The server's own connection, using the secret key. It bypasses row level
 * security, so call it only from code that has already decided the caller
 * may do what it is about to do.
 */
export function adminClient(): SupabaseClient {
  client ??= createClient(serverEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
