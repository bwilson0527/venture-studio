import "server-only";

import type { Lead } from "@studio/core/leads";

import { adminClient } from "./supabase-admin";

/** Store an early-access sign-up. Signing up twice updates the same lead. */
export async function captureLead(lead: Lead, source: string | null): Promise<void> {
  const { error } = await adminClient().rpc("capture_lead", {
    p_email: lead.email,
    p_firm_name: lead.firmName,
    p_client_count: lead.clientCount,
    p_source: source,
  });
  if (error) throw new Error(`capture_lead failed: ${error.code} ${error.message}`);
}
