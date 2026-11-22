import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { serverEnv } from "./env";

/**
 * A connection that acts as the signed-in firm user. The session lives in
 * cookies, and the database applies row level security to everything this
 * client does. Create one per request; never share it.
 */
export async function userClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(serverEnv.supabaseUrl, serverEnv.supabasePublishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Cookies cannot be written while a page renders. proxy.ts refreshes
          // the session before the page runs, so nothing is lost here.
        }
      },
    },
  });
}
