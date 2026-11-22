import "server-only";

import { headers } from "next/headers";

import { clientAddress, LIMITS, rateLimitKey, type LimitName } from "@studio/core/rate-limit";

import { serverEnv } from "./env";
import { adminClient } from "./supabase-admin";

/**
 * Count one attempt and say whether it may go ahead. If the counter itself
 * cannot be reached the attempt is allowed: a fault here should not lock
 * everyone out of signing in.
 */
export async function allowed(name: LimitName, subject: string): Promise<boolean> {
  try {
    const { limit, windowSeconds } = LIMITS[name];
    const { data, error } = await adminClient().rpc("take_rate_limit", {
      // Derived from an existing server secret, with its own prefix inside the hash.
      p_key: rateLimitKey(serverEnv.portalTokenSecret, name, subject),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw new Error(`${error.code} ${error.message}`);
    return data !== false;
  } catch (error) {
    console.error("Rate limit check failed:", error instanceof Error ? error.message : "unknown error");
    return true;
  }
}

/**
 * The same, counted against the visitor's network address. Where the host
 * reports no address (local development) there is nothing fair to count
 * against, so the attempt is allowed rather than sharing one limit among everyone.
 */
export async function allowedForVisitor(name: LimitName): Promise<boolean> {
  const requestHeaders = await headers();
  const address = clientAddress((header) => requestHeaders.get(header));
  return address === "unknown" ? true : allowed(name, address);
}
